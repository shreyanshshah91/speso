import { useMemo } from 'react';

import { filterTransactions, useConvert } from '@/hooks/ledger';
import { computePeriod } from '@/lib/period';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';

export interface CategoryBudget {
  budgetId: number;
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  limit: number;
  spent: number;
  left: number;
}

/** Budget status for the current monthly cycle, all amounts in the home currency. */
export function useBudgetStatus(offset = 0) {
  const budgets = useData((s) => s.budgets);
  const categories = useData((s) => s.categories);
  const transactions = useData((s) => s.ledger);
  const monthStartDay = usePrefs((s) => s.monthStartDay);
  const weekStartDay = usePrefs((s) => s.weekStartDay);
  const convert = useConvert();

  return useMemo(() => {
    const period = computePeriod('monthly', offset, { monthStartDay, weekStartDay });
    const expenses = filterTransactions(transactions, { from: period.from, to: period.to, type: 'expense' });
    const spentByCat = new Map<number, number>();
    let spentAll = 0;
    for (const t of expenses) {
      const v = convert(t.amount, t.currencyCode);
      spentAll += v;
      spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + v);
    }
    const catById = new Map(categories.map((c) => [c.id, c]));
    const items: CategoryBudget[] = [];
    let overall: { id: number; limit: number } | null = null;
    for (const b of budgets) {
      const limit = convert(b.amount, b.currencyCode);
      if (b.categoryId === null) {
        overall = { id: b.id, limit };
        continue;
      }
      const c = catById.get(b.categoryId);
      if (!c) continue;
      const spent = spentByCat.get(c.id) ?? 0;
      items.push({ budgetId: b.id, categoryId: c.id, name: c.name, icon: c.icon, color: c.color, limit, spent, left: limit - spent });
    }
    items.sort((a, b) => (catById.get(a.categoryId)?.sortOrder ?? 0) - (catById.get(b.categoryId)?.sortOrder ?? 0));
    const categoryTotal = items.reduce((s, i) => s + i.limit, 0);
    const totalLimit = overall ? overall.limit : categoryTotal;
    // With an overall budget everything counts; otherwise only budgeted categories do.
    const totalSpent = overall ? spentAll : items.reduce((s, i) => s + i.spent, 0);
    return {
      period,
      hasAny: budgets.length > 0,
      overallId: overall?.id ?? null,
      items,
      totalLimit,
      totalSpent,
      totalLeft: totalLimit - totalSpent,
    };
  }, [budgets, categories, transactions, monthStartDay, weekStartDay, convert, offset]);
}
