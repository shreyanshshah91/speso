import type { SQLiteDatabase } from 'expo-sqlite';

import { inTransaction } from '@/db/transaction';
import type { Account } from '@/types';

interface AccountRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  currency_code: string;
  opening_balance: number;
  is_default: number;
  sort_order: number;
  archived: number;
}

function mapRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    currencyCode: row.currency_code,
    openingBalance: row.opening_balance,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
  };
}

export async function listAccounts(db: SQLiteDatabase, includeArchived = false): Promise<Account[]> {
  const rows = includeArchived
    ? await db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY sort_order ASC, id ASC')
    : await db.getAllAsync<AccountRow>(
        'SELECT * FROM accounts WHERE archived = 0 ORDER BY sort_order ASC, id ASC'
      );
  return rows.map(mapRow);
}

export async function createAccount(
  db: SQLiteDatabase,
  input: Pick<Account, 'name' | 'icon' | 'color' | 'currencyCode' | 'openingBalance'>
): Promise<number> {
  const maxRow = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sort_order) as maxOrder FROM accounts'
  );
  const sortOrder = (maxRow?.maxOrder ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO accounts (name, icon, color, currency_code, opening_balance, is_default, sort_order, archived)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
    input.name,
    input.icon,
    input.color,
    input.currencyCode,
    input.openingBalance,
    sortOrder
  );
  return result.lastInsertRowId;
}

export async function updateAccount(
  db: SQLiteDatabase,
  id: number,
  input: Pick<Account, 'name' | 'icon' | 'color' | 'currencyCode' | 'openingBalance'>
) {
  await db.runAsync(
    'UPDATE accounts SET name = ?, icon = ?, color = ?, currency_code = ?, opening_balance = ? WHERE id = ?',
    input.name,
    input.icon,
    input.color,
    input.currencyCode,
    input.openingBalance,
    id
  );
}

/** Makes `id` the default account for new entries (exactly one account is the default). */
export async function setDefaultAccount(db: SQLiteDatabase, id: number) {
  await db.runAsync('UPDATE accounts SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END', id);
}

/**
 * Permanently deletes an account together with its transactions, transfers, recurring rules and
 * account-specific budgets. If it was the last account, a fresh empty default account is created
 * in `homeCurrency` so transactions always have somewhere to go. Callers should take a snapshot
 * first so this can be undone.
 */
export async function deleteAccount(db: SQLiteDatabase, id: number, homeCurrency: string) {
  const others = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM accounts WHERE archived = 0 AND id != ?', id);
  const wasLast = (others?.c ?? 0) < 1;
  await inTransaction(db, async (txn) => {
    await txn.runAsync('DELETE FROM transactions WHERE account_id = ?', id);
    await txn.runAsync('DELETE FROM account_transfers WHERE from_account_id = ? OR to_account_id = ?', id, id);
    await txn.runAsync('DELETE FROM recurring_rules WHERE account_id = ?', id);
    await txn.runAsync('DELETE FROM budgets WHERE account_id = ?', id);
    const wasDefault = await txn.getFirstAsync<{ is_default: number }>('SELECT is_default FROM accounts WHERE id = ?', id);
    await txn.runAsync('DELETE FROM accounts WHERE id = ?', id);
    if (wasLast) {
      await txn.runAsync(
        `INSERT INTO accounts (name, icon, color, currency_code, opening_balance, is_default, sort_order, archived)
         VALUES ('Main account', '🏦', '#EAB308', ?, 0, 1, 0, 0)`,
        homeCurrency
      );
    } else if (wasDefault?.is_default) {
      await txn.runAsync(
        'UPDATE accounts SET is_default = 1 WHERE id = (SELECT id FROM accounts WHERE archived = 0 ORDER BY sort_order ASC, id ASC LIMIT 1)'
      );
    }
  });
}

export async function reorderAccounts(db: SQLiteDatabase, orderedIds: number[]) {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE accounts SET sort_order = ? WHERE id = ?', i, orderedIds[i]);
    }
  });
}
