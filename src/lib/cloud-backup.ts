import { format } from 'date-fns';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { create } from 'zustand';

import DriveSave from '../../modules/drive-save';
import { APP_NAME } from '@/constants/app';
import { getDb } from '@/db/client';
import { buildSnapshot, InvalidBackupError, parseBackupText, readImportFile, restoreSnapshot, takeSnapshot, type BackupSnapshot } from '@/lib/backup';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';

/**
 * Automatic off-device backup.
 *
 * The app keeps one encrypted backup file in its private files folder (`kova-backup/`). On Android,
 * the app's backup rules (plugins/with-android-backup.js) let Android's built-in Google backup copy
 * ONLY that folder to the user's Google account — never the database or its key. On iOS the file
 * is part of the normal iCloud device backup. After a reset or on a new phone, reinstalling the app
 * brings the file back and the app offers to restore it.
 *
 * The file is AES-256-GCM encrypted with a key derived from a backup password, so it can be
 * opened on any device with the password and by nobody without it. The key derivation is the
 * OpenPGP "iterated and salted" S2K: SHA-256 over the salt+password repeated to 16 MiB — as much
 * work per guess as ~130k PBKDF2 rounds, but done natively in one call, so it takes a fraction of
 * a second on a phone (pure-JS PBKDF2 took minutes under Hermes). Hashing and AES both run in
 * native code via expo-crypto. The password is never stored; the derived key stays in the
 * device's secure storage for the automatic re-saves.
 *
 * Copies saved to Google Drive by hand (`saveBackupToDrive`) are plain backups with no password;
 * password-protected Drive copies from earlier versions still restore with `restoreBackupFile`.
 * (The folder, file and envelope names keep the app's original name, Kova, so older backups
 * still restore.)
 */

const DIR_NAME = 'kova-backup'; // must match the Android backup rules
const FILE_NAME = 'latest.kova';
const S2K_BYTES = 16 * 1024 * 1024;
const KEY_ITEM = 'kova.cloudBackup.key';
const SALT_ITEM = 'kova.cloudBackup.salt';
const SAVE_DELAY_MS = 4000;
const DRIVE_DIR = 'drive-backup';
const DRIVE_MIME = 'application/json';
export const MIN_PASSWORD = 6;

interface Envelope {
  app: 'kova';
  v: 2;
  createdAt: string;
  transactions: number;
  kdf: { alg: 's2k-sha256'; bytes: number; salt: string };
  cipher: 'aes-256-gcm';
  /** Base64 of nonce ‖ ciphertext ‖ tag. */
  data: string;
}

export interface CloudBackupInfo {
  createdAt: string;
  transactions: number;
}

export const isCloudBackupSupported = Platform.OS !== 'web';

/** Name of the system backup the file rides along with, for UI copy. */
export const CLOUD_NAME = Platform.OS === 'ios' ? 'iCloud' : 'Google';

/** A backup found on first launch (e.g. restored by Android after a reinstall), offered before
 * onboarding. Cleared once the user restores or chooses to start fresh. */
export const useRestoreOffer = create<{ info: CloudBackupInfo | null; setInfo: (info: CloudBackupInfo | null) => void }>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));

// ---- helpers ----------------------------------------------------------------------------------
// Small self-contained encoders, so nothing depends on which web globals the JS engine provides.

const HEX = '0123456789abcdef';
function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15];
  return s;
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function utf8Encode(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 3);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out[n++] = c;
    else if (c < 0x800) {
      out[n++] = 0xc0 | (c >> 6);
      out[n++] = 0x80 | (c & 63);
    } else if (c < 0x10000) {
      out[n++] = 0xe0 | (c >> 12);
      out[n++] = 0x80 | ((c >> 6) & 63);
      out[n++] = 0x80 | (c & 63);
    } else {
      out[n++] = 0xf0 | (c >> 18);
      out[n++] = 0x80 | ((c >> 12) & 63);
      out[n++] = 0x80 | ((c >> 6) & 63);
      out[n++] = 0x80 | (c & 63);
    }
  }
  return out.slice(0, n);
}

function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let c = b;
    if (b >= 0xf0) c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (b >= 0xe0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (b >= 0xc0) c = ((b & 31) << 6) | (bytes[i++] & 63);
    if (c > 0xffff) {
      c -= 0x10000;
      chunk.push(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else chunk.push(c);
    if (chunk.length > 8000) {
      parts.push(String.fromCharCode(...chunk));
      chunk = [];
    }
  }
  parts.push(String.fromCharCode(...chunk));
  return parts.join('');
}

function backupFile(): File {
  return new File(new Directory(Paths.document, DIR_NAME), FILE_NAME);
}

/** OpenPGP-style iterated+salted S2K: SHA-256 of (salt ‖ password) repeated to `bytes` bytes. */
async function deriveKey(password: string, salt: Uint8Array, bytes: number): Promise<Uint8Array> {
  const pw = utf8Encode(password);
  const unit = new Uint8Array(salt.length + pw.length);
  unit.set(salt);
  unit.set(pw, salt.length);
  const buf = new Uint8Array(Math.max(bytes, unit.length));
  buf.set(unit.subarray(0, Math.min(unit.length, buf.length)));
  // Fill by doubling (native memmove), keeping an exact repetition of `unit`.
  for (let filled = Math.min(unit.length, buf.length); filled < buf.length; ) {
    const n = Math.min(filled, buf.length - filled);
    buf.copyWithin(filled, 0, n);
    filled += n;
  }
  return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buf));
}

function parseEnvelope(text: string): Envelope | null {
  try {
    const e = JSON.parse(text) as Partial<Envelope>;
    if (e.app !== 'kova' || e.v !== 2 || !e.kdf || typeof e.kdf.salt !== 'string' || typeof e.data !== 'string') return null;
    const bytes = Number(e.kdf.bytes);
    if (!Number.isInteger(bytes) || bytes < 1024 * 1024 || bytes > 64 * 1024 * 1024) return null;
    return { ...(e as Envelope), kdf: { ...e.kdf, bytes } };
  } catch {
    return null;
  }
}

function readEnvelope(): Envelope | null {
  const file = backupFile();
  if (!file.exists) return null;
  try {
    return parseEnvelope(file.textSync());
  } catch {
    return null;
  }
}

async function storedKey(): Promise<Uint8Array | null> {
  const k = await SecureStore.getItemAsync(KEY_ITEM);
  return k && /^[0-9a-f]{64}$/.test(k) ? fromHex(k) : null;
}

async function storeKey(key: Uint8Array, salt: Uint8Array) {
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  await SecureStore.setItemAsync(KEY_ITEM, toHex(key), opts);
  await SecureStore.setItemAsync(SALT_ITEM, toHex(salt), opts);
}

// ---- public API -------------------------------------------------------------------------------

/** Metadata of the backup file on this device (e.g. one Android restored after a reinstall). */
export function readCloudBackupInfo(): CloudBackupInfo | null {
  if (!isCloudBackupSupported) return null;
  const e = readEnvelope();
  return e ? { createdAt: e.createdAt, transactions: e.transactions } : null;
}

/** True when backups are switched on and this device holds the key to write them. */
export async function canWriteCloudBackup(): Promise<boolean> {
  return isCloudBackupSupported && usePrefs.getState().cloudBackup && !!(await storedKey());
}

/** Encrypts the whole ledger with the stored backup key, or null when no password is set. */
async function seal(db: SQLiteDatabase): Promise<Envelope | null> {
  const key = await storedKey();
  const salt = await SecureStore.getItemAsync(SALT_ITEM);
  if (!key || !salt) return null;
  const snapshot = await buildSnapshot(db);
  const sealed = await Crypto.aesEncryptAsync(utf8Encode(JSON.stringify(snapshot)), await Crypto.AESEncryptionKey.import(key));
  return {
    app: 'kova',
    v: 2,
    createdAt: new Date().toISOString(),
    transactions: snapshot.tables.transactions?.length ?? 0,
    kdf: { alg: 's2k-sha256', bytes: S2K_BYTES, salt },
    cipher: 'aes-256-gcm',
    data: await sealed.combined('base64'),
  };
}

/** Encrypts the whole ledger into the backup file. No-op unless backups are on. */
export async function writeCloudBackup(db: SQLiteDatabase = getDb()): Promise<boolean> {
  if (!isCloudBackupSupported || !usePrefs.getState().cloudBackup) return false;
  const envelope = await seal(db);
  if (!envelope) return false;

  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  // Write a temp file first so a crash mid-write never leaves a broken backup behind.
  const tmp = new File(dir, `${FILE_NAME}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.write(JSON.stringify(envelope));
  const file = backupFile();
  if (file.exists) file.delete();
  tmp.move(file);
  usePrefs.getState().set('cloudBackupAt', envelope.createdAt);
  return true;
}

/** True when this device holds a backup password (set for automatic backup or for Drive). */
export async function hasBackupPassword(): Promise<boolean> {
  return isCloudBackupSupported && !!(await storedKey());
}

/** Sets (or changes) the backup password used for the automatic backup and Drive copies. */
export async function setBackupPassword(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new InvalidBackupError(`Use at least ${MIN_PASSWORD} characters.`);
  const salt = Crypto.getRandomBytes(16);
  await storeKey(await deriveKey(password, salt, S2K_BYTES), salt);
}

/**
 * Turns backups on and writes a fresh backup. With a password it becomes the backup password;
 * without one, the password already on this device is used.
 */
export async function enableCloudBackup(password?: string): Promise<void> {
  if (password !== undefined) await setBackupPassword(password);
  else if (!(await storedKey())) throw new InvalidBackupError('Choose a backup password first.');
  usePrefs.getState().set('cloudBackup', true);
  await writeCloudBackup();
}

/**
 * Turns backups off and deletes the backup file (so Google backup stops keeping a copy). The
 * password stays, so Drive copies keep working without setting it again.
 */
export async function disableCloudBackup(): Promise<void> {
  usePrefs.getState().set('cloudBackup', false);
  usePrefs.getState().set('cloudBackupAt', null);
  try {
    const file = backupFile();
    if (file.exists) file.delete();
  } catch {
    // best effort
  }
}

/**
 * Decrypts `e` with `password`, replaces all data with it and adopts the password on this device.
 * With `keepCurrent`, the current data is saved as a snapshot once the password proves right.
 */
async function openEnvelope(e: Envelope, password: string, db: SQLiteDatabase, keepCurrent = false) {
  if (!/^[0-9a-f]{32,128}$/.test(e.kdf.salt)) throw new InvalidBackupError('This backup file is damaged.');
  const salt = fromHex(e.kdf.salt);
  const key = await deriveKey(password, salt, e.kdf.bytes);
  let plain: Uint8Array;
  try {
    plain = await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(e.data), await Crypto.AESEncryptionKey.import(key));
  } catch {
    throw new InvalidBackupError('That password is not right for this backup.');
  }
  const snapshot = parseBackupText(utf8Decode(plain));
  if (keepCurrent) await takeSnapshot(db);
  await restoreSnapshot(db, snapshot);
  await usePrefs.getState().hydrate();
  // Keep saving with this password (re-deriving if the file used a different work factor).
  await storeKey(e.kdf.bytes === S2K_BYTES ? key : await deriveKey(password, salt, S2K_BYTES), salt);
}

/**
 * Decrypts the backup file with `password` and replaces all data with it. On success this device
 * adopts the password, so automatic backups carry on from here.
 */
export async function restoreCloudBackup(password: string, db: SQLiteDatabase = getDb()): Promise<void> {
  const e = readEnvelope();
  if (!e) throw new InvalidBackupError('No backup was found on this device.');
  await openEnvelope(e, password, db);
  usePrefs.getState().set('cloudBackup', true);
  await useData.getState().reload();
}

// ---- Google Drive copies ----------------------------------------------------------------------

/**
 * A backup file picked from Drive (or anywhere else), already checked. Drive copies are plain
 * backups; `encrypted` covers the password-protected copies earlier versions saved.
 */
export type PickedBackup =
  | { kind: 'plain'; snapshot: BackupSnapshot; info: CloudBackupInfo }
  | { kind: 'encrypted'; text: string; info: CloudBackupInfo };
export type EncryptedBackup = Extract<PickedBackup, { kind: 'encrypted' }>;

function driveDir(): Directory {
  return new Directory(Paths.cache, DRIVE_DIR);
}

/** Deletes the copy left in the cache for Drive (it isn't encrypted). Safe to call any time. */
export function cleanDriveBackupCache() {
  if (Platform.OS === 'web') return;
  try {
    const dir = driveDir();
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}

const DRIVE_CACHE_MS = 10 * 60 * 1000;

/** At start-up: removes a copy left over from a Drive save more than 10 minutes ago. */
export function cleanStaleDriveBackupCache() {
  if (Platform.OS === 'web') return;
  try {
    const dir = driveDir();
    if (!dir.exists) return;
    for (const item of dir.list()) {
      if (item instanceof File && Date.now() - (item.info().modificationTime ?? 0) > DRIVE_CACHE_MS) item.delete();
    }
  } catch {
    // best effort
  }
}

/** What happened to a "Save to Google Drive": saved for sure, backed out, or handed to the share
 * sheet (iOS / no native module), where we can't tell. */
export type DriveSaveResult = 'saved' | 'cancelled' | 'shared';

/**
 * Writes the ledger to a backup file and opens Android's "Save to" screen, where Google Drive is
 * one of the places to pick (it opens on the last place used). The backup time is recorded only
 * when the file is actually saved. Without the native module (iOS) it opens the share sheet. No
 * password: the file is a plain backup, the same format as Export backup file.
 */
export async function saveBackupToDrive(db: SQLiteDatabase = getDb()): Promise<DriveSaveResult> {
  const snapshot = await buildSnapshot(db);
  cleanDriveBackupCache();
  const dir = driveDir();
  dir.create({ intermediates: true, idempotent: true });
  const name = `speso-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
  const file = new File(dir, name);
  file.write(JSON.stringify(snapshot));

  if (DriveSave) {
    try {
      const saved = await DriveSave.saveDocument(file.uri, DRIVE_MIME, name);
      if (!saved) return 'cancelled';
      usePrefs.getState().set('driveBackupAt', new Date().toISOString());
      return 'saved';
    } finally {
      // The file has been copied (or the save was abandoned): no plain copy stays behind.
      cleanDriveBackupCache();
    }
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: DRIVE_MIME, dialogTitle: 'Save backup to Google Drive', UTI: 'public.json' });
  // Drive reads the file when you tap Save; don't keep a plain copy around after that.
  setTimeout(cleanDriveBackupCache, DRIVE_CACHE_MS);
  return 'shared';
}

/** Lets the user pick a backup file (Drive shows up in the picker) and checks it. Null if cancelled. */
export async function pickBackupFile(): Promise<PickedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await readImportFile(res.assets[0]);
  const e = parseEnvelope(text);
  if (e) return { kind: 'encrypted', text, info: { createdAt: e.createdAt, transactions: e.transactions } };
  if (!text.trimStart().startsWith('{')) throw new InvalidBackupError(`Pick a backup file saved from ${APP_NAME}.`);
  const snapshot = parseBackupText(text);
  return { kind: 'plain', snapshot, info: { createdAt: snapshot.exportedAt, transactions: snapshot.tables.transactions?.length ?? 0 } };
}

/** "Backup from 26 Sep 2026 with 120 transactions." for confirmations. */
export function backupSummary(info: CloudBackupInfo): string {
  const date = info.createdAt ? new Date(info.createdAt) : null;
  const when = date && !Number.isNaN(date.getTime()) ? ` from ${format(date, 'd MMM yyyy')}` : '';
  return `Backup${when} with ${info.transactions} ${info.transactions === 1 ? 'transaction' : 'transactions'}.`;
}

/** Replaces all data with a plain backup. The current data is kept as a snapshot first. */
export async function restorePlainBackup(snapshot: BackupSnapshot, db: SQLiteDatabase = getDb()): Promise<void> {
  await takeSnapshot(db);
  await restoreSnapshot(db, snapshot);
  await usePrefs.getState().hydrate();
  await useData.getState().reload();
}

/**
 * Restores a password-protected backup file (saved by earlier versions) with its password. The
 * current data is kept as a snapshot first, and this device adopts the password.
 */
export async function restoreBackupFile(file: EncryptedBackup, password: string, db: SQLiteDatabase = getDb()): Promise<void> {
  const e = parseEnvelope(file.text);
  if (!e) throw new InvalidBackupError(`Pick a backup file saved from ${APP_NAME}.`);
  await openEnvelope(e, password, db, true);
  await useData.getState().reload();
}

/**
 * Re-saves the backup a few seconds after the data changes (and once at start-up), while backups
 * are on. Returns an unsubscribe function.
 */
export function startCloudBackupAutoSave(): () => void {
  if (!isCloudBackupSupported) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (!usePrefs.getState().cloudBackup) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writeCloudBackup().catch(() => undefined);
    }, SAVE_DELAY_MS);
  };
  schedule();
  const unsub = useData.subscribe((s, prev) => {
    if (s.transactions !== prev.transactions || s.categories !== prev.categories || s.accounts !== prev.accounts || s.budgets !== prev.budgets || s.recurring !== prev.recurring || s.transfers !== prev.transfers) {
      schedule();
    }
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
