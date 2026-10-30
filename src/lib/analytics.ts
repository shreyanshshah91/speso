import { eachDayOfInterval, endOfMonth, format, parseISO } from 'date-fns';

import { toISODate } from '@/lib/format';
import { computePeriod, type PeriodSettings } from '@/lib/period';

/**
 * Analytics periods, as in the reference: each shows one "page" of bars and pages by swiping.
 * - Weekly: the days of one week (Mon – Sun).
 * - Monthly: six months.
 * - Quarterly: the four quarters of one year.
 * - Yearly (`ytd`): six years.
 */
export type AnalyticsPeriod = 'monthly' | 'weekly' | 'quarterly' | 'ytd';

export const ANALYTICS_PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'ytd', label: 'Yearly' },
];

export function isAnalyticsPeriod(v: unknown): v is AnalyticsPeriod {
  return ANALYTICS_PERIODS.some((p) => p.value === v);
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  from: string;
  to: string;
  /** Starts after today (shown empty, left out of averages). */
  future: boolean;
}

export interface AnalyticsView {
  kind: AnalyticsPeriod;
  buckets: AnalyticsBucket[];
  from: string;
  to: string;
  /** Index of the bucket containing today, or -1 on other pages. */
  current: number;
  /** What one bucket is ("this month"); for Weekly the whole page is the week. */
  unit: 'week' | 'month' | 'quarter' | 'year';
}

const PAGE = 6;
const pad = (n: number) => String(n).padStart(2, '0');

/** One page of analytics buckets. `page` 0 holds today; -1 is the page before, and so on. */
export function analyticsView(kind: AnalyticsPeriod, page: number, s: PeriodSettings, now: Date = new Date()): AnalyticsView {
  const today = toISODate(now);
  let raw: Omit<AnalyticsBucket, 'future'>[];

  if (kind === 'weekly') {
    const week = computePeriod('weekly', page, s, now);
    raw = eachDayOfInterval({ start: parseISO(week.from), end: parseISO(week.to) }).map((d) => {
      const k = toISODate(d);
      return { key: k, label: format(d, 'EEE'), from: k, to: k };
    });
  } else if (kind === 'quarterly') {
    const year = now.getFullYear() + page;
    raw = [0, 1, 2, 3].map((q) => ({
      key: `${year}-Q${q + 1}`,
      label: `Q${q + 1}`,
      from: `${year}-${pad(q * 3 + 1)}-01`,
      to: toISODate(endOfMonth(new Date(year, q * 3 + 2, 1))),
    }));
  } else if (kind === 'ytd') {
    const last = now.getFullYear() + page * PAGE;
    raw = Array.from({ length: PAGE }, (_, i) => {
      const y = last - (PAGE - 1) + i;
      return { key: String(y), label: String(y), from: `${y}-01-01`, to: `${y}-12-31` };
    });
  } else {
    raw = Array.from({ length: PAGE }, (_, i) => {
      const p = computePeriod('monthly', page * PAGE + i - (PAGE - 1), s, now);
      return { key: p.from, label: format(parseISO(p.from), 'MMM'), from: p.from, to: p.to };
    });
  }

  const buckets = raw.map((b) => ({ ...b, future: b.from > today }));
  return {
    kind,
    buckets,
    from: buckets[0].from,
    to: buckets[buckets.length - 1].to,
    current: buckets.findIndex((b) => b.from <= today && today <= b.to),
    unit: kind === 'weekly' ? 'week' : kind === 'monthly' ? 'month' : kind === 'quarterly' ? 'quarter' : 'year',
  };
}

/** A bucket named with its year ("Sat 26 Sep 2026", "Sep 2026", "Q3 2026", "2026"). */
export function bucketTitle(kind: AnalyticsPeriod, b: AnalyticsBucket): string {
  const from = parseISO(b.from);
  if (kind === 'weekly') return format(from, 'EEE d MMM yyyy');
  if (kind === 'quarterly') return `${b.label} ${format(from, 'yyyy')}`;
  if (kind === 'ytd') return b.label;
  return format(from, 'MMM yyyy');
}

/** The whole page ("21 – 27 Sep 2026", "2026", "2021 – 2026", "Apr – Sep 2026"). */
export function pageTitle(view: AnalyticsView): string {
  const from = parseISO(view.from);
  const to = parseISO(view.to);
  const sameYear = from.getFullYear() === to.getFullYear();
  if (view.kind === 'weekly') return `${format(from, sameYear ? (from.getMonth() === to.getMonth() ? 'd' : 'd MMM') : 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
  if (view.kind === 'quarterly') return format(from, 'yyyy');
  if (view.kind === 'ytd') return `${format(from, 'yyyy')} – ${format(to, 'yyyy')}`;
  // Months are named by their first day (a month can start on e.g. the 25th).
  const lastMonth = parseISO(view.buckets[view.buckets.length - 1].from);
  return `${format(from, from.getFullYear() === lastMonth.getFullYear() ? 'MMM' : 'MMM yyyy')} – ${format(lastMonth, 'MMM yyyy')}`;
}
