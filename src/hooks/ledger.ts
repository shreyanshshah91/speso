import { useCallback, useMemo } from 'react';

import { formatMoney, maskedMoney } from '@/lib/format';
import { computePeriod, type Period, type PeriodKind } from '@/lib/period';
import { toHomeAmount, useData } from '@/store/data';
import { useFilters, usePrefs, type FilterScope } from '@/store/prefs';
import type { TransactionWithCategory } from '@/types';

/** Period helper bound to the current preferences and ledger (for "All time"). */
export function usePeriodComputer(yearlyQuarters = false) {
  const monthStartDay = usePrefs((s) => s.monthStartDay);
  const weekStartDay = usePrefs((s) => s.weekStartDay);
  const transactions = useData((s) => s.ledger);
  // Transactions are sorted newest first, so the last one is the earliest.
  const earliest = transactions.length ? transactions[transactions.length - 1].date : null;
  return useCallback(
    (kind: PeriodKind, offset: number, customFrom?: string | null, customTo?: string | null): Period =>
      computePeriod(kind, offset, { monthStartDay, weekStartDay, customFrom, customTo, earliest, yearlyQuarters }),
    [monthStartDay, weekStartDay, earliest, yearlyQuarters]
  );
}

/** The period currently selected in a tab's filters. */
export function usePeriod(scope: FilterScope): Period {
  const { period, offset, customFrom, customTo } = useFilters(scope);
  // Activity, Summary and category pages show "Quarterly" as the year in quarters.
  const compute = usePeriodComputer(true);
  return useMemo(() => compute(period, offset, customFrom, customTo), [compute, period, offset, customFrom, customTo]);
}

/** Returns a formatter that honours home currency, cents, currency format and "Hide balances". */
export function useMoney() {
  const home = usePrefs((s) => s.homeCurrency);
  const cents = usePrefs((s) => s.displayCents);
  const fmt = usePrefs((s) => s.currencyFormat);
  const hidden = usePrefs((s) => s.hideBalances);
  return useCallback(
    (amount: number, code: string = home, opts: { signed?: boolean; forceCents?: boolean; ignoreHide?: boolean } = {}) =>
      hidden && !opts.ignoreHide
        ? maskedMoney(code, fmt)
        : formatMoney(amount, code, { cents: cents || !!opts.forceCents, format: fmt, signed: opts.signed }),
    [home, cents, fmt, hidden]
  );
}

export function useConvert() {
  const toHome = useData((s) => s.toHome);
  return useCallback((amount: number, code: string) => toHomeAmount(toHome, amount, code), [toHome]);
}

export interface TxFilter {
  from?: string;
  to?: string;
  type?: 'expense' | 'income' | null;
  accountId?: number | null;
  categoryIds?: number[] | null;
}

export function filterTransactions(list: TransactionWithCategory[], f: TxFilter): TransactionWithCategory[] {
  const cats = f.categoryIds ? new Set(f.categoryIds) : null;
  return list.filter(
    (t) =>
      (!f.from || t.date >= f.from) &&
      (!f.to || t.date <= f.to) &&
      (!f.type || t.type === f.type) &&
      (f.accountId == null || t.accountId === f.accountId) &&
      (!cats || cats.has(t.categoryId))
  );
}

export function sumHome(list: TransactionWithCategory[], convert: (a: number, c: string) => number): number {
  let total = 0;
  for (const t of list) total += convert(t.amount, t.currencyCode);
  return total;
}

/** Percent change vs the previous period, or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
