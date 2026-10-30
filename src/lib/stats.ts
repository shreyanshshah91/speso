import {
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getDaysInMonth,
  isBefore,
  parseISO,
  setDate,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';

import type { TransactionWithCategory } from '@/types';

/** Converts an amount already expressed in `currencyCode` into the home currency. */
export type ConvertFn = (amount: number, currencyCode: string) => number;

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
}

export function summarize(
  transactions: TransactionWithCategory[],
  convert: ConvertFn
): PeriodSummary {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    const value = convert(t.amount, t.currencyCode);
    if (t.type === 'income') income += value;
    else expense += value;
  }
  return { income, expense, net: income - expense };
}

export interface CategoryTotal {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  total: number;
  percent: number;
}

export function groupByCategory(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  type: 'expense' | 'income' = 'expense'
): CategoryTotal[] {
  const filtered = transactions.filter((t) => t.type === type);
  const totals = new Map<number, CategoryTotal>();
  let grandTotal = 0;

  for (const t of filtered) {
    const value = convert(t.amount, t.currencyCode);
    grandTotal += value;
    const existing = totals.get(t.categoryId);
    if (existing) {
      existing.total += value;
    } else {
      totals.set(t.categoryId, {
        categoryId: t.categoryId,
        name: t.categoryName,
        icon: t.categoryIcon,
        color: t.categoryColor,
        total: value,
        percent: 0,
      });
    }
  }

  const result = Array.from(totals.values());
  for (const item of result) {
    item.percent = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
  }
  return result.sort((a, b) => b.total - a.total);
}

export interface MonthBucket {
  label: string;
  monthKey: string;
  income: number;
  expense: number;
}

export function groupByMonth(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  monthsBack: number
): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    buckets.push({
      label: format(monthDate, 'MMM'),
      monthKey: format(monthDate, 'yyyy-MM'),
      income: 0,
      expense: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.monthKey, b]));

  for (const t of transactions) {
    const key = format(parseISO(t.date), 'yyyy-MM');
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const value = convert(t.amount, t.currencyCode);
    if (t.type === 'income') bucket.income += value;
    else bucket.expense += value;
  }

  return buckets;
}

export interface TrendBucket {
  label: string;
  key: string;
  income: number;
  expense: number;
}

export function groupByWeek(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  weeksBack: number
): TrendBucket[] {
  const now = new Date();
  const buckets: TrendBucket[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    buckets.push({
      label: format(weekStart, 'MMM d'),
      key: format(weekStart, 'yyyy-MM-dd'),
      income: 0,
      expense: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const t of transactions) {
    const weekStart = startOfWeek(parseISO(t.date), { weekStartsOn: 1 });
    const key = format(weekStart, 'yyyy-MM-dd');
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const value = convert(t.amount, t.currencyCode);
    if (t.type === 'income') bucket.income += value;
    else bucket.expense += value;
  }

  return buckets;
}

export function groupByYear(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  yearsBack: number
): TrendBucket[] {
  const now = new Date();
  const buckets: TrendBucket[] = [];
  for (let i = yearsBack - 1; i >= 0; i--) {
    const yearDate = subYears(now, i);
    buckets.push({ label: format(yearDate, 'yyyy'), key: format(yearDate, 'yyyy'), income: 0, expense: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const t of transactions) {
    const key = format(parseISO(t.date), 'yyyy');
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const value = convert(t.amount, t.currencyCode);
    if (t.type === 'income') bucket.income += value;
    else bucket.expense += value;
  }

  return buckets;
}

export function monthOverMonthChange(buckets: MonthBucket[]): number | null {
  if (buckets.length < 2) return null;
  const current = buckets[buckets.length - 1].expense;
  const previous = buckets[buckets.length - 2].expense;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Average expense-per-day within [cycleFrom, referenceDate], for the current (in-progress) cycle. */
export function averageDailySpend(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  cycleFrom: string,
  referenceDate: Date = new Date()
): number {
  const referenceIso = format(referenceDate, 'yyyy-MM-dd');
  const inRange = transactions.filter(
    (t) => t.type === 'expense' && t.date >= cycleFrom && t.date <= referenceIso
  );
  const total = inRange.reduce((sum, t) => sum + convert(t.amount, t.currencyCode), 0);
  const daysElapsed = differenceInCalendarDays(referenceDate, parseISO(cycleFrom)) + 1;
  return daysElapsed > 0 ? total / daysElapsed : 0;
}

/** Projects the full-cycle total by extrapolating the current daily average across the whole cycle. */
export function projectedCycleEndTotal(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  cycleFrom: string,
  cycleTo: string,
  referenceDate: Date = new Date()
): number {
  const daily = averageDailySpend(transactions, convert, cycleFrom, referenceDate);
  const totalDays = differenceInCalendarDays(parseISO(cycleTo), parseISO(cycleFrom)) + 1;
  return daily * totalDays;
}

function clampToMonth(date: Date, day: number): Date {
  return setDate(date, Math.min(day, getDaysInMonth(date)));
}

function startOfCycleContaining(date: Date, startDay: number): Date {
  const candidate = clampToMonth(date, startDay);
  if (isBefore(date, candidate)) {
    return clampToMonth(subMonths(date, 1), startDay);
  }
  return candidate;
}

export interface CycleRange {
  from: string;
  to: string;
  label: string;
}

export type CycleType = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * The [from, to] bounds of a spending "cycle": weekly (starting on `startDay`, an ISO
 * weekday 1=Monday..7=Sunday), monthly (starting on `startDay`, a day-of-month 1-28,
 * clamped to shorter months), quarterly (calendar quarters), or yearly (the calendar
 * year). `cycleOffset` shifts by whole cycles: 0 = current, -1 = previous, etc.
 */
export function cycleDateRange(cycleType: CycleType, startDay: number, cycleOffset = 0): CycleRange {
  const now = new Date();

  if (cycleType === 'weekly') {
    const weekStartsOn = (startDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const currentStart = startOfWeek(now, { weekStartsOn });
    const shiftedStart = addWeeks(currentStart, cycleOffset);
    const end = subDays(addWeeks(shiftedStart, 1), 1);
    return {
      from: format(shiftedStart, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      label: `Week of ${format(shiftedStart, 'MMM d, yyyy')}`,
    };
  }

  if (cycleType === 'quarterly') {
    const currentStart = startOfQuarter(now);
    const shiftedStart = addQuarters(currentStart, cycleOffset);
    const end = subDays(addQuarters(shiftedStart, 1), 1);
    return {
      from: format(shiftedStart, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      label: `Q${format(shiftedStart, 'Q yyyy')}`,
    };
  }

  if (cycleType === 'yearly') {
    const currentStart = startOfYear(now);
    const shiftedStart = addYears(currentStart, cycleOffset);
    const end = subDays(addYears(shiftedStart, 1), 1);
    return {
      from: format(shiftedStart, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      label: format(shiftedStart, 'yyyy'),
    };
  }

  const currentCycleStart = startOfCycleContaining(now, startDay);
  const shiftedStart = clampToMonth(addMonths(currentCycleStart, cycleOffset), startDay);
  const nextStart = clampToMonth(addMonths(shiftedStart, 1), startDay);
  const end = subDays(nextStart, 1);
  return {
    from: format(shiftedStart, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
    label: format(shiftedStart, 'MMMM yyyy'),
  };
}

export interface DayBucket {
  label: string;
  key: string;
  day: number;
  expense: number;
  income: number;
  count: number;
}

/** Buckets transactions by calendar day within [from, to] (inclusive), for a calendar-heatmap view. */
export function groupByDay(
  transactions: TransactionWithCategory[],
  convert: ConvertFn,
  from: string,
  to: string
): DayBucket[] {
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  const buckets: DayBucket[] = days.map((d) => ({
    label: format(d, 'd'),
    key: format(d, 'yyyy-MM-dd'),
    day: Number(format(d, 'd')),
    expense: 0,
    income: 0,
    count: 0,
  }));
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const t of transactions) {
    const bucket = byKey.get(t.date);
    if (!bucket) continue;
    const value = convert(t.amount, t.currencyCode);
    if (t.type === 'income') bucket.income += value;
    else bucket.expense += value;
    bucket.count += 1;
  }

  return buckets;
}
