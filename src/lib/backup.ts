import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { seedDefaultAccountAndIncomeCategories, seedDefaultExpenseCategories, SCHEMA_VERSION } from '@/db/schema';
import { inTransaction } from '@/db/transaction';
import { downloadInBrowser } from '@/lib/download';
import { LIMITS } from '@/lib/validate';

export const BACKUP_FORMAT_VERSION = 2;
const KEEP_SNAPSHOTS = 10;
const MAX_CELL_CHARS = 2000;

/** Restorable tables, in foreign-key-safe insertion order. */
const TABLES = [
  'currencies',
  'exchange_rates',
  'settings',
  'categories',
  'accounts',
  'transactions',
  'account_transfers',
  'recurring_rules',
  'budgets',
] as const;
type TableName = (typeof TABLES)[number];

type Cell = string | number | null;
type Row = Record<string, Cell>;

export interface BackupSnapshot {
  formatVersion: number;
  schemaVersion?: number;
  exportedAt: string;
  tables: Partial<Record<TableName, Row[]>>;
}

export class InvalidBackupError extends Error {}

export async function buildSnapshot(db: SQLiteDatabase): Promise<BackupSnapshot> {
  const tables: BackupSnapshot['tables'] = {};
  for (const t of TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  return { formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

// ---------------------------------------------------------------------------------------------
// Automatic snapshots (stored inside the encrypted database)
// ---------------------------------------------------------------------------------------------

export interface SnapshotInfo {
  id: number;
  createdAt: string;
  bytes: number;
}

/** Takes at most one snapshot per calendar day and keeps the latest few. */
export async function checkAndRunDailyBackup(db: SQLiteDatabase): Promise<boolean> {
  await removeLegacyPlaintextBackups();
  const today = new Date().toISOString().slice(0, 10);
  const last = await db.getFirstAsync<{ created_at: string }>('SELECT created_at FROM snapshots ORDER BY id DESC LIMIT 1');
  if (last && last.created_at.slice(0, 10) === today) return false;
  await takeSnapshot(db);
  return true;
}

export async function takeSnapshot(db: SQLiteDatabase) {
  const snap = await buildSnapshot(db);
  await db.runAsync('INSERT INTO snapshots (created_at, data) VALUES (?, ?)', snap.exportedAt, JSON.stringify(snap));
  await db.runAsync(
    'DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)',
    KEEP_SNAPSHOTS
  );
}

export async function listSnapshots(db: SQLiteDatabase): Promise<SnapshotInfo[]> {
  const rows = await db.getAllAsync<{ id: number; created_at: string; bytes: number }>(
    'SELECT id, created_at, length(data) AS bytes FROM snapshots ORDER BY id DESC'
  );
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, bytes: r.bytes }));
}

export async function restoreFromSnapshot(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM snapshots WHERE id = ?', id);
  if (!row) throw new InvalidBackupError('Snapshot not found.');
  await restoreSnapshot(db, parseBackupText(row.data));
}

/** Earlier versions wrote daily JSON backups as loose plaintext files; delete them. */
async function removeLegacyPlaintextBackups() {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, 'backups');
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------------------------
// Manual export / import
// ---------------------------------------------------------------------------------------------

/** Writes a backup file to the cache, opens the share sheet (Files, Drive, …) and cleans up. */
export async function exportBackupAndShare(db: SQLiteDatabase): Promise<void> {
  const snap = await buildSnapshot(db);
  const stamp = new Date().toISOString().slice(0, 10);
  if (Platform.OS === 'web') {
    downloadInBrowser(`ledger-backup-${stamp}.json`, JSON.stringify(snap), 'application/json');
    return;
  }
  const file = new File(Paths.cache, `ledger-backup-${stamp}.json`);
  try {
    if (file.exists) file.delete();
    file.write(JSON.stringify(snap));
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup', UTI: 'public.json' });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }
}

/** Reads a user-picked file (from expo-document-picker) with a hard size cap. */
export async function readImportFile(asset: { uri: string; size?: number | null; file?: Blob }): Promise<string> {
  if (asset.file) {
    // Web: the picker hands back a browser File object.
    if (asset.file.size > LIMITS.importBytes) throw new InvalidBackupError('That file is too large to import.');
    return asset.file.text();
  }
  const file = new File(asset.uri);
  const bytes = asset.size ?? file.size ?? 0;
  if (bytes > LIMITS.importBytes) throw new InvalidBackupError('That file is too large to import.');
  try {
    return file.textSync();
  } finally {
    // The picker copied the file into our cache; don't leave a plaintext copy behind.
    try {
      if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete();
    } catch {
      // ignore
    }
  }
}

/** Parses and structurally validates backup JSON without touching the database. */
export function parseBackupText(text: string): BackupSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidBackupError('This file is not a valid backup.');
  }
  if (!parsed || typeof parsed !== 'object') throw new InvalidBackupError('This file is not a valid backup.');
  const p = parsed as Record<string, unknown>;
  if (typeof p.formatVersion !== 'number' || !p.tables || typeof p.tables !== 'object') {
    throw new InvalidBackupError('This file is not a valid backup.');
  }
  if (p.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new InvalidBackupError('This backup was made by a newer version of the app. Please update first.');
  }
  const rawTables = p.tables as Record<string, unknown>;
  const tables: BackupSnapshot['tables'] = {};
  let total = 0;
  for (const t of TABLES) {
    const rows = rawTables[t];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new InvalidBackupError(`Backup table "${t}" is malformed.`);
    total += rows.length;
    if (total > LIMITS.importRows) throw new InvalidBackupError('This backup has too many rows.');
    tables[t] = rows.map((r) => sanitizeRow(r, t));
  }
  if (!tables.categories?.length) throw new InvalidBackupError('This backup contains no categories.');
  return { formatVersion: p.formatVersion, exportedAt: String(p.exportedAt ?? ''), tables };
}

function sanitizeRow(row: unknown, table: string): Row {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new InvalidBackupError(`Backup table "${table}" is malformed.`);
  const out: Row = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (v === null || typeof v === 'number') {
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, MAX_CELL_CHARS);
    } else if (typeof v === 'boolean') {
      out[k] = v ? 1 : 0;
    }
  }
  return out;
}

async function columnsOf(db: SQLiteDatabase, table: TableName): Promise<Set<string>> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(cols.map((c) => c.name));
}

/**
 * Destructively replaces all data with `snapshot`. Only columns that actually exist in the
 * current schema are written (column names are checked against PRAGMA table_info, never taken
 * from the file verbatim), all values are bound as parameters, and the whole restore runs in one
 * transaction so a bad file can never leave the ledger half-replaced.
 */
export async function restoreSnapshot(db: SQLiteDatabase, snapshot: BackupSnapshot): Promise<void> {
  const allowed = new Map<TableName, Set<string>>();
  for (const t of TABLES) allowed.set(t, await columnsOf(db, t));

  await inTransaction(db, async (txn) => {
    await txn.execAsync('PRAGMA defer_foreign_keys = ON;');
    for (const t of [...TABLES].reverse()) await txn.execAsync(`DELETE FROM ${t}`);

    for (const t of TABLES) {
      const cols = allowed.get(t)!;
      for (const row of snapshot.tables[t] ?? []) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (keys.length === 0) continue;
        const sql = `INSERT OR REPLACE INTO ${t} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
        await txn.runAsync(sql, ...keys.map((k) => row[k]));
      }
    }

    // Backups from before accounts existed: attach everything to a fresh default account.
    const hasAccount = await txn.getFirstAsync('SELECT 1 FROM accounts WHERE archived = 0 LIMIT 1');
    if (!hasAccount) {
      const home = (await txn.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'homeCurrency'"))?.value ?? 'USD';
      const id = await seedDefaultAccountAndIncomeCategoriesIfMissing(txn, home);
      await txn.runAsync('UPDATE transactions SET account_id = ? WHERE account_id IS NULL OR account_id NOT IN (SELECT id FROM accounts)', id);
      await txn.runAsync('UPDATE recurring_rules SET account_id = ? WHERE account_id IS NULL OR account_id NOT IN (SELECT id FROM accounts)', id);
    }
    // Drop anything that would dangle.
    await txn.execAsync(`
      DELETE FROM transactions WHERE category_id NOT IN (SELECT id FROM categories);
      DELETE FROM recurring_rules WHERE category_id NOT IN (SELECT id FROM categories);
      DELETE FROM budgets WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM categories);
      DELETE FROM account_transfers WHERE from_account_id NOT IN (SELECT id FROM accounts) OR to_account_id NOT IN (SELECT id FROM accounts);
    `);
  });
}

async function seedDefaultAccountAndIncomeCategoriesIfMissing(db: SQLiteDatabase, home: string): Promise<number> {
  const hasIncome = await db.getFirstAsync("SELECT 1 FROM categories WHERE type = 'income' LIMIT 1");
  if (hasIncome) {
    const r = await db.runAsync(
      "INSERT INTO accounts (name, icon, color, currency_code, opening_balance, is_default, sort_order, archived) VALUES ('Main account', '🏦', '#EAB308', ?, 0, 1, 0, 0)",
      home
    );
    return r.lastInsertRowId;
  }
  return seedDefaultAccountAndIncomeCategories(db, home);
}

/** Wipes the ledger (a snapshot is taken first so it can be undone from Backups) and reseeds
 * the default categories and one account. Settings and exchange rates are kept. */
export async function eraseAllData(db: SQLiteDatabase, homeCurrency: string): Promise<void> {
  await takeSnapshot(db);
  await inTransaction(db, async (txn) => {
    await txn.execAsync(`
      DELETE FROM account_transfers;
      DELETE FROM budgets;
      DELETE FROM recurring_rules;
      DELETE FROM transactions;
      DELETE FROM accounts;
      DELETE FROM categories;
    `);
    await seedDefaultExpenseCategories(txn);
    await seedDefaultAccountAndIncomeCategories(txn, homeCurrency);
  });
}
