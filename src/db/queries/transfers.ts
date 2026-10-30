import type { SQLiteDatabase } from 'expo-sqlite';

import type { AccountTransfer } from '@/types';

interface TransferRow {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  currency_code: string;
  date: string;
  note: string;
}

function mapRow(row: TransferRow): AccountTransfer {
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amount: row.amount,
    currencyCode: row.currency_code,
    date: row.date,
    note: row.note,
  };
}

export async function listTransfers(db: SQLiteDatabase): Promise<AccountTransfer[]> {
  const rows = await db.getAllAsync<TransferRow>(
    'SELECT * FROM account_transfers ORDER BY date DESC, id DESC'
  );
  return rows.map(mapRow);
}

export async function createTransfer(
  db: SQLiteDatabase,
  input: Omit<AccountTransfer, 'id'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO account_transfers (from_account_id, to_account_id, amount, currency_code, date, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.fromAccountId,
    input.toAccountId,
    input.amount,
    input.currencyCode,
    input.date,
    input.note
  );
  return result.lastInsertRowId;
}

export async function updateTransfer(db: SQLiteDatabase, id: number, input: Omit<AccountTransfer, 'id'>) {
  await db.runAsync(
    `UPDATE account_transfers
     SET from_account_id = ?, to_account_id = ?, amount = ?, currency_code = ?, date = ?, note = ?
     WHERE id = ?`,
    input.fromAccountId,
    input.toAccountId,
    input.amount,
    input.currencyCode,
    input.date,
    input.note,
    id
  );
}

export async function deleteTransfer(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM account_transfers WHERE id = ?', id);
}
