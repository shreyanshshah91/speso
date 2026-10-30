import type { SQLiteDatabase } from 'expo-sqlite';

let current: SQLiteDatabase | null = null;
let encrypted = false;

/** Registered once by the root layout after the database is open and migrated, so stores and
 * actions can write without threading the connection through every component. */
export function setDb(db: SQLiteDatabase, isEncrypted: boolean) {
  current = db;
  encrypted = isEncrypted;
}

/** Whether the open database is SQLCipher-encrypted (native builds). */
export function isDbEncrypted(): boolean {
  return encrypted;
}

export function getDb(): SQLiteDatabase {
  if (!current) throw new Error('Database not ready');
  return current;
}
