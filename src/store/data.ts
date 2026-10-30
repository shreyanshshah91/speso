import { create } from 'zustand';

import { getDb } from '@/db/client';
import { listAccounts } from '@/db/queries/accounts';
import { listBudgets } from '@/db/queries/budgets';
import { listCategories } from '@/db/queries/categories';
import { listRecurringRules } from '@/db/queries/recurring';
import { listTransactions } from '@/db/queries/transactions';
import { listTransfers } from '@/db/queries/transfers';
import { buildToHomeMap, type RateRow } from '@/lib/currency';
import { isValidSpreadRange, monthShares, rangeShares } from '@/lib/spread';
import { usePrefs } from '@/store/prefs';
import type { Account, AccountTransfer, Budget, Category, RecurringRule, TransactionWithCategory } from '@/types';

interface DataState {
  loaded: boolean;
  /** The real entries, exactly as saved (edit screens, balances, category usage). */
  transactions: TransactionWithCategory[];
  /** Entries as reports see them: a spread entry becomes one equal share per month (charts,
   * Summary, budgets, the calendar and the Activity list). */
  ledger: TransactionWithCategory[];
  categories: Category[];
  accounts: Account[];
  transfers: AccountTransfer[];
  budgets: Budget[];
  recurring: RecurringRule[];
  rateRows: RateRow[];
  /** Home-currency units per 1 unit of each currency. */
  toHome: Record<string, number>;
  /** Reloads everything from SQLite. Call after any write. */
  reload: () => Promise<void>;
  /** Recomputes `toHome` (e.g. after the home currency changes) without touching the ledger. */
  reloadRates: () => Promise<void>;
}

/**
 * The whole ledger is held in memory: a personal ledger is at most tens of thousands of rows,
 * which loads in milliseconds and lets every screen derive totals, charts and lists synchronously
 * with memoised selectors instead of issuing per-screen queries.
 */
export const useData = create<DataState>((set) => ({
  loaded: false,
  transactions: [],
  ledger: [],
  categories: [],
  accounts: [],
  transfers: [],
  budgets: [],
  recurring: [],
  rateRows: [],
  toHome: {},

  reload: async () => {
    const db = getDb();
    const [transactions, categories, accounts, transfers, budgets, recurring, rateRows] = await Promise.all([
      listTransactions(db),
      listCategories(db),
      listAccounts(db),
      listTransfers(db),
      listBudgets(db),
      listRecurringRules(db),
      db.getAllAsync<RateRow>('SELECT base_code, target_code, rate, is_manual FROM exchange_rates'),
    ]);
    const home = usePrefs.getState().homeCurrency;
    set({
      loaded: true,
      transactions,
      ledger: expandSpread(transactions),
      categories,
      accounts,
      transfers,
      budgets,
      recurring,
      rateRows,
      toHome: buildToHomeMap(rateRows, home),
    });
  },

  reloadRates: async () => {
    const rateRows = await getDb().getAllAsync<RateRow>(
      'SELECT base_code, target_code, rate, is_manual FROM exchange_rates'
    );
    set({ rateRows, toHome: buildToHomeMap(rateRows, usePrefs.getState().homeCurrency) });
  },
}));

/**
 * Splits each spread entry into monthly shares for reports: equal shares over N months, or — for
 * a date range — shares matching the days covered in each month. Shares are whole cents that add
 * up exactly to the entry. Newest first, like the source list.
 */
export function expandSpread(transactions: TransactionWithCategory[]): TransactionWithCategory[] {
  if (!transactions.some((t) => t.spreadMonths > 1 || t.spreadFrom)) return transactions;
  const out: TransactionWithCategory[] = [];
  for (const t of transactions) {
    const shares = isValidSpreadRange(t.spreadFrom, t.spreadTo)
      ? rangeShares(t.amount, t.spreadFrom!, t.spreadTo!)
      : t.spreadMonths > 1
        ? monthShares(t.amount, t.date, t.spreadMonths)
        : null;
    if (!shares || shares.length <= 1) {
      out.push(shares?.length === 1 ? { ...t, date: shares[0].date } : t);
      continue;
    }
    shares.forEach((sh, i) => out.push({ ...t, amount: sh.amount, date: sh.date, part: { index: i + 1, of: shares.length, total: t.amount } }));
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  return out;
}

/** Converts an amount in `code` to the home currency (1:1 when no rate is cached yet). */
export function toHomeAmount(toHome: Record<string, number>, amount: number, code: string): number {
  return amount * (toHome[code] ?? 1);
}
