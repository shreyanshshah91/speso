import type { SQLiteDatabase } from 'expo-sqlite';
import { addMonths, addWeeks, addYears, formatISO, isBefore, parseISO } from 'date-fns';

import type { RecurringFrequency, RecurringRule, TransactionType } from '@/types';

interface RuleRow {
  id: number;
  amount: number;
  currency_code: string;
  category_id: number;
  account_id: number;
  type: TransactionType;
  note: string;
  frequency: RecurringFrequency;
  day_of_period: number;
  next_run_date: string;
  active: number;
}

function mapRow(row: RuleRow): RecurringRule {
  return {
    id: row.id,
    amount: row.amount,
    currencyCode: row.currency_code,
    categoryId: row.category_id,
    accountId: row.account_id,
    type: row.type,
    note: row.note,
    frequency: row.frequency,
    dayOfPeriod: row.day_of_period,
    nextRunDate: row.next_run_date,
    active: row.active === 1,
  };
}

export async function listRecurringRules(db: SQLiteDatabase): Promise<RecurringRule[]> {
  const rows = await db.getAllAsync<RuleRow>(
    'SELECT * FROM recurring_rules ORDER BY active DESC, next_run_date ASC'
  );
  return rows.map(mapRow);
}

export async function createRecurringRule(
  db: SQLiteDatabase,
  input: Omit<RecurringRule, 'id' | 'active'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recurring_rules (amount, currency_code, category_id, account_id, type, note, frequency, day_of_period, next_run_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    input.amount,
    input.currencyCode,
    input.categoryId,
    input.accountId,
    input.type,
    input.note,
    input.frequency,
    input.dayOfPeriod,
    input.nextRunDate
  );
  return result.lastInsertRowId;
}

export async function updateRecurringRule(
  db: SQLiteDatabase,
  id: number,
  input: Partial<Omit<RecurringRule, 'id'>>
) {
  const fields: string[] = [];
  const params: (string | number)[] = [];
  const map: Record<string, unknown> = {
    amount: input.amount,
    currency_code: input.currencyCode,
    category_id: input.categoryId,
    account_id: input.accountId,
    type: input.type,
    note: input.note,
    frequency: input.frequency,
    day_of_period: input.dayOfPeriod,
    next_run_date: input.nextRunDate,
    active: input.active === undefined ? undefined : input.active ? 1 : 0,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      params.push(value as string | number);
    }
  }
  if (fields.length === 0) return;
  await db.runAsync(`UPDATE recurring_rules SET ${fields.join(', ')} WHERE id = ?`, ...params, id);
}

export async function deleteRecurringRule(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM recurring_rules WHERE id = ?', id);
}

export function advanceDate(date: Date, frequency: RecurringFrequency): Date {
  switch (frequency) {
    case 'weekly':
      return addWeeks(date, 1);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
  }
}

/** Generates transactions for every recurring rule whose next_run_date has passed, then advances it. */
export async function runDueRecurringRules(db: SQLiteDatabase, now: Date = new Date()) {
  const dueRules = await db.getAllAsync<RuleRow>(
    'SELECT * FROM recurring_rules WHERE active = 1 AND next_run_date <= ?',
    formatISO(now, { representation: 'date' })
  );

  for (const row of dueRules) {
    const rule = mapRow(row);
    let cursor = parseISO(rule.nextRunDate);
    const today = now;
    let safety = 0;
    while (!isBefore(today, cursor) && safety < 60) {
      await db.runAsync(
        `INSERT INTO transactions (amount, currency_code, category_id, account_id, type, note, date, receipt_uri, recurring_rule_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        rule.amount,
        rule.currencyCode,
        rule.categoryId,
        rule.accountId,
        rule.type,
        rule.note,
        formatISO(cursor, { representation: 'date' }),
        rule.id
      );
      cursor = advanceDate(cursor, rule.frequency);
      safety++;
    }
    await db.runAsync(
      'UPDATE recurring_rules SET next_run_date = ? WHERE id = ?',
      formatISO(cursor, { representation: 'date' }),
      rule.id
    );
  }

  return dueRules.length;
}
