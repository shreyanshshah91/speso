import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Runs `task` atomically on the app's main connection.
 *
 * Deliberately not `withExclusiveTransactionAsync`: that opens a second native connection, which
 * does not receive our SQLCipher `PRAGMA key` and so cannot read the encrypted database (and it
 * isn't supported on web at all). All writes in the app are awaited sequentially, so a regular
 * transaction on the keyed connection is both correct and safe.
 */
export async function inTransaction(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<void>): Promise<void> {
  await db.withTransactionAsync(() => task(db));
}
