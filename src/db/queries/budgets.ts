import type { SQLiteDatabase } from 'expo-sqlite';

import type { Budget } from '@/types';

interface BudgetRow {
  id: number;
  category_id: number | null;
  account_id: number | null;
  amount: number;
  currency_code: string;
  period: 'monthly';
  start_date: string;
}

function mapRow(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    accountId: row.account_id,
    amount: row.amount,
    currencyCode: row.currency_code,
    period: row.period,
    startDate: row.start_date,
  };
}

export async function listBudgets(db: SQLiteDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets ORDER BY category_id IS NULL DESC, id ASC');
  return rows.map(mapRow);
}

export async function upsertBudget(
  db: SQLiteDatabase,
  input: Omit<Budget, 'id'> & { id?: number }
): Promise<number> {
  if (input.id) {
    await db.runAsync(
      'UPDATE budgets SET amount = ?, currency_code = ?, start_date = ? WHERE id = ?',
      input.amount,
      input.currencyCode,
      input.startDate,
      input.id
    );
    return input.id;
  }
  const result = await db.runAsync(
    'INSERT INTO budgets (category_id, account_id, amount, currency_code, period, start_date) VALUES (?, ?, ?, ?, ?, ?)',
    input.categoryId,
    input.accountId,
    input.amount,
    input.currencyCode,
    input.period,
    input.startDate
  );
  return result.lastInsertRowId;
}

export async function deleteBudget(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
}
