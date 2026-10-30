import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory, deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

/** Legacy unencrypted database from earlier versions (and the fallback when SQLCipher is absent,
 * e.g. in Expo Go or on web). */
export const PLAIN_DB_NAME = 'expense-tracker.db';
/** SQLCipher-encrypted database used by native builds. */
export const ENCRYPTED_DB_NAME = 'ledger.db';

const KEY_STORE_NAME = 'ledger-db-key-v1';
const HEX_KEY_RE = /^[0-9a-f]{64}$/;

export interface DatabaseTarget {
  name: string;
  /** 256-bit raw key as 64 hex chars, or null when the database is not encrypted. */
  key: string | null;
  /** Set when an encrypted database existed but could no longer be decrypted and was set aside. */
  recoveredFromUnreadable: boolean;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function getOrCreateKey(): Promise<string> {
  // AFTER_FIRST_UNLOCK (not *_THIS_DEVICE_ONLY) so the key travels with an encrypted iOS device
  // backup; otherwise restoring a phone would leave the database permanently unreadable.
  const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  const existing = await SecureStore.getItemAsync(KEY_STORE_NAME, opts);
  if (existing && HEX_KEY_RE.test(existing)) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_STORE_NAME, key, opts);
  return key;
}

/** The PRAGMA that unlocks an encrypted connection. Safe to interpolate: the key is validated hex. */
export function keyPragma(key: string): string {
  if (!HEX_KEY_RE.test(key)) throw new Error('Invalid database key');
  return `PRAGMA key = "x'${key}'";`;
}

function dbFile(name: string): File {
  return new File(`file://${defaultDatabaseDirectory}/${name}`);
}

async function sqlCipherAvailable(): Promise<boolean> {
  const probe = await openDatabaseAsync(':memory:');
  try {
    const row = await probe.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
    return !!row?.cipher_version;
  } catch {
    return false;
  } finally {
    await probe.closeAsync();
  }
}

async function canOpenEncrypted(key: string): Promise<boolean> {
  const db = await openDatabaseAsync(ENCRYPTED_DB_NAME);
  try {
    await db.execAsync(keyPragma(key));
    await db.getFirstAsync('SELECT count(*) AS c FROM sqlite_master');
    return true;
  } catch {
    return false;
  } finally {
    await db.closeAsync();
  }
}

/** Copies the legacy plaintext database into a new encrypted one, then deletes the plaintext copy. */
async function encryptLegacyDatabase(key: string) {
  const plain = await openDatabaseAsync(PLAIN_DB_NAME);
  try {
    const version = (await plain.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    const target = `${defaultDatabaseDirectory}/${ENCRYPTED_DB_NAME}`;
    await plain.runAsync('ATTACH DATABASE ? AS enc KEY ?', target, `x'${key}'`);
    await plain.execAsync("SELECT sqlcipher_export('enc');");
    // sqlcipher_export does not carry user_version, which drives our migrations.
    await plain.execAsync(`PRAGMA enc.user_version = ${Number(version) | 0};`);
    await plain.execAsync('DETACH DATABASE enc;');
  } finally {
    await plain.closeAsync();
  }
  if (await canOpenEncrypted(key)) {
    await deleteDatabaseAsync(PLAIN_DB_NAME);
  } else {
    throw new Error('Encrypted copy failed verification');
  }
}

/**
 * Decides which database file to open and with what key. On native builds with SQLCipher this
 * guarantees the ledger is encrypted at rest with a random 256-bit key held in the iOS Keychain /
 * Android Keystore, transparently migrating any older unencrypted database on first run.
 */
export async function prepareDatabase(): Promise<DatabaseTarget> {
  const plainTarget: DatabaseTarget = { name: PLAIN_DB_NAME, key: null, recoveredFromUnreadable: false };
  if (Platform.OS === 'web') return plainTarget;

  try {
    if (!(await sqlCipherAvailable())) return plainTarget;
    const key = await getOrCreateKey();
    const encExists = dbFile(ENCRYPTED_DB_NAME).exists;
    const plainExists = dbFile(PLAIN_DB_NAME).exists;

    if (!encExists && plainExists) {
      try {
        await encryptLegacyDatabase(key);
      } catch {
        // Never lose data: keep running on the plaintext file and retry on next launch.
        if (dbFile(ENCRYPTED_DB_NAME).exists) await deleteDatabaseAsync(ENCRYPTED_DB_NAME).catch(() => undefined);
        return plainTarget;
      }
      return { name: ENCRYPTED_DB_NAME, key, recoveredFromUnreadable: false };
    }

    if (encExists && !(await canOpenEncrypted(key))) {
      // The key was lost (e.g. app data restored without its keychain entry). Keep the unreadable
      // file aside rather than deleting it, and start a fresh ledger.
      const aside = dbFile(ENCRYPTED_DB_NAME);
      aside.move(dbFile(`ledger-unreadable-${Date.now()}.db`));
      return { name: ENCRYPTED_DB_NAME, key, recoveredFromUnreadable: true };
    }

    return { name: ENCRYPTED_DB_NAME, key, recoveredFromUnreadable: false };
  } catch {
    return plainTarget;
  }
}
