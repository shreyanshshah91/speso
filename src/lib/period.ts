import {
  addDays,
  addQuarters,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subYears,
} from 'date-fns';

import { toISODate } from '@/lib/format';
import { cycleDateRange } from '@/lib/stats';

export type PeriodKind = 'weekly' | 'monthly' | 'quarterly' | 'ytd' | 'last6' | 'last12' | 'all' | 'custom';

export const PERIOD_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

export const PERIOD_PILL: Record<PeriodKind, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  quarterly: 'Quarterly',
  ytd: 'Year to date',
  last6: 'Last 6 months',
  last12: 'Last 12 months',
  all: 'All time',
  custom: 'Custom',
};

/** Periods that can be stepped back and forth (header picker, swipe on charts). */
export function isShiftable(kind: PeriodKind): boolean {
  return kind === 'weekly' || kind === 'monthly' || kind === 'quarterly' || kind === 'ytd';
}

export interface PeriodSettings {
  monthStartDay: number;
  weekStartDay: number;
  customFrom?: string | null;
  customTo?: string | null;
  /** Earliest transaction date, for "All time". */
  earliest?: string | null;
  /** "Quarterly" as the whole year split into quarters (Activity, Summary) rather than a single
   * quarter (Analytics, which lines up several quarters side by side). */
  yearlyQuarters?: boolean;
}

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  /** "This month", "Last week", "August", "Q3 2026", "Last 6 months" … */
  title: string;
  /** The comparable previous range and its short name ("Aug"), or null when there is none. */
  previous: { from: string; to: string; short: string } | null;
  /** How chart bars are bucketed for this range. */
  bucket: 'day' | 'week' | 'month' | 'quarter';
}

function bucketFor(from: string, to: string): Period['bucket'] {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export function computePeriod(kind: PeriodKind, offset: number, s: PeriodSettings, now: Date = new Date()): Period {
  const today = toISODate(now);
  const make = (from: string, to: string, title: string, previous: Period['previous'], bucket?: Period['bucket']): Period => ({
    kind,
    from,
    to,
    title,
    previous,
    bucket: bucket ?? bucketFor(from, to),
  });

  if (kind === 'weekly' || kind === 'monthly') {
    const startDay = kind === 'weekly' ? s.weekStartDay : s.monthStartDay;
    const cur = cycleDateRange(kind, startDay, offset);
    const prev = cycleDateRange(kind, startDay, offset - 1);
    const from = parseISO(cur.from);
    const unit = kind === 'weekly' ? 'week' : 'month';
    let title: string;
    if (offset === 0) title = `This ${unit}`;
    else if (offset === -1) title = `Last ${unit}`;
    else if (kind === 'monthly') title = format(from, isSameYear(from, now) ? 'MMMM' : 'MMMM yyyy');
    else title = `${format(from, 'd MMM')} – ${format(parseISO(cur.to), 'd MMM')}`;
    const prevFrom = parseISO(prev.from);
    const short = kind === 'monthly' ? format(prevFrom, 'MMM') : offset === 0 ? 'last week' : format(prevFrom, 'd MMM');
    return make(cur.from, cur.to, title, { from: prev.from, to: prev.to, short });
  }

  if (kind === 'quarterly' && s.yearlyQuarters) {
    // The year in four quarter bars, like the reference ("This year", Q1 – Q4).
    const year = now.getFullYear() + offset;
    const title = offset === 0 ? 'This year' : offset === -1 ? 'Last year' : String(year);
    return make(`${year}-01-01`, `${year}-12-31`, title, { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, short: String(year - 1) }, 'quarter');
  }

  if (kind === 'quarterly') {
    const start = addQuarters(startOfQuarter(now), offset);
    const end = addDays(addQuarters(start, 1), -1);
    const pStart = addQuarters(start, -1);
    const pEnd = addDays(start, -1);
    const title = offset === 0 ? 'This quarter' : offset === -1 ? 'Last quarter' : `Q${format(start, 'Q yyyy')}`;
    return make(toISODate(start), toISODate(end), title, { from: toISODate(pStart), to: toISODate(pEnd), short: `Q${format(pStart, 'Q')}` });
  }

  if (kind === 'ytd') {
    if (offset === 0) {
      // The whole year, so all twelve months show as bars (future ones empty), like the reference;
      // it's compared with the same stretch of last year.
      const year = now.getFullYear();
      const pStart = new Date(year - 1, 0, 1);
      const pEnd = subYears(now, 1);
      return make(`${year}-01-01`, `${year}-12-31`, 'This year', { from: toISODate(pStart), to: toISODate(pEnd), short: format(pStart, 'yyyy') }, 'month');
    }
    const year = now.getFullYear() + offset;
    return make(`${year}-01-01`, `${year}-12-31`, String(year), { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, short: String(year - 1) }, 'month');
  }

  if (kind === 'last6' || kind === 'last12') {
    const n = kind === 'last6' ? 6 : 12;
    const start = startOfMonth(subMonths(now, n - 1));
    const pStart = subMonths(start, n);
    const pEnd = endOfMonth(subMonths(start, 1));
    return make(toISODate(start), today, `Last ${n} months`, { from: toISODate(pStart), to: toISODate(pEnd), short: `previous ${n} months` }, 'month');
  }

  if (kind === 'custom' && s.customFrom && s.customTo) {
    const [from, to] = s.customFrom <= s.customTo ? [s.customFrom, s.customTo] : [s.customTo, s.customFrom];
    const len = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
    const pTo = addDays(parseISO(from), -1);
    const pFrom = addDays(pTo, -(len - 1));
    const f = parseISO(from);
    const t = parseISO(to);
    const title = `${format(f, isSameYear(f, t) ? 'd MMM' : 'd MMM yyyy')} – ${format(t, isSameYear(t, now) ? 'd MMM' : 'd MMM yyyy')}`;
    return make(from, to, title, { from: toISODate(pFrom), to: toISODate(pTo), short: 'previous period' });
  }

  // All time (and custom before both dates are chosen).
  const earliest = s.earliest && s.earliest < today ? s.earliest : today;
  return make(earliest, today, 'All time', null);
}
