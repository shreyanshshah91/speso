import type { SQLiteDatabase } from 'expo-sqlite';

import { isValidSpreadRange } from '@/lib/spread';
import type { Transaction, TransactionType, TransactionWithCategory } from '@/types';

interface TxRow {
  id: number;
  amount: number;
  currency_code: string;
  category_id: number;
  account_id: number;
  type: TransactionType;
  note: string;
  date: string;
  receipt_uri: string | null;
  recurring_rule_id: number | null;
  spread_months?: number | null;
  spread_from?: string | null;
  spread_to?: string | null;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

function mapRow(row: TxRow): TransactionWithCategory {
  return {
    id: row.id,
    amount: row.amount,
    currencyCode: row.currency_code,
    categoryId: row.category_id,
    accountId: row.account_id,
    type: row.type,
    note: row.note,
    date: row.date,
    receiptUri: row.receipt_uri,
    recurringRuleId: row.recurring_rule_id,
    spreadMonths: clampSpread(row.spread_months ?? 1),
    spreadFrom: row.spread_from ?? null,
    spreadTo: row.spread_to ?? null,
    categoryName: row.category_name ?? '',
    categoryIcon: row.category_icon ?? '📦',
    categoryColor: row.category_color ?? '#71717A',
  };
}

/** Spread is 1–36 whole months. */
export function clampSpread(n: number): number {
  return Number.isFinite(n) ? Math.min(36, Math.max(1, Math.round(n))) : 1;
}

/** The date range to store, or nulls when it's missing or invalid. */
function spreadRange(input: Pick<Transaction, 'spreadFrom' | 'spreadTo'>): [string | null, string | null] {
  return isValidSpreadRange(input.spreadFrom, input.spreadTo) ? [input.spreadFrom!, input.spreadTo!] : [null, null];
}

const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
`;

export interface TransactionFilters {
  search?: string;
  fromDate?: string;
  toDate?: string;
  accountId?: number;
}

export async function listTransactions(
  db: SQLiteDatabase,
  filters: TransactionFilters = {}
): Promise<TransactionWithCategory[]> {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters.search) {
    clauses.push('(t.note LIKE ? OR c.name LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.fromDate) {
    clauses.push('t.date >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    clauses.push('t.date <= ?');
    params.push(filters.toDate);
  }
  if (filters.accountId) {
    clauses.push('t.account_id = ?');
    params.push(filters.accountId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<TxRow>(
    `${SELECT_WITH_CATEGORY} ${where} ORDER BY t.date DESC, t.id DESC`,
    ...params
  );
  return rows.map(mapRow);
}

export async function getTransaction(
  db: SQLiteDatabase,
  id: number
): Promise<TransactionWithCategory | null> {
  const row = await db.getFirstAsync<TxRow>(`${SELECT_WITH_CATEGORY} WHERE t.id = ?`, id);
  return row ? mapRow(row) : null;
}

export async function createTransaction(
  db: SQLiteDatabase,
  input: Omit<Transaction, 'id'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO transactions (amount, currency_code, category_id, account_id, type, note, date, receipt_uri, recurring_rule_id, spread_months, spread_from, spread_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.amount,
    input.currencyCode,
    input.categoryId,
    input.accountId,
    input.type,
    input.note,
    input.date,
    input.receiptUri,
    input.recurringRuleId,
    clampSpread(input.spreadMonths ?? 1),
    ...spreadRange(input)
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: number,
  input: Omit<Transaction, 'id'>
) {
  await db.runAsync(
    `UPDATE transactions
     SET amount = ?, currency_code = ?, category_id = ?, account_id = ?, type = ?, note = ?, date = ?, receipt_uri = ?, spread_months = ?, spread_from = ?, spread_to = ?
     WHERE id = ?`,
    input.amount,
    input.currencyCode,
    input.categoryId,
    input.accountId,
    input.type,
    input.note,
    input.date,
    input.receiptUri,
    clampSpread(input.spreadMonths ?? 1),
    ...spreadRange(input),
    id
  );
}

export async function deleteTransaction(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}
