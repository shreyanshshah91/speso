import { addDays, addMonths, eachDayOfInterval, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

import { toISODate } from '@/lib/format';
import type { Period } from '@/lib/period';

export interface BarDatum {
  key: string;
  /** Primary value (white bar). */
  value: number;
  /** Optional secondary value stacked on top (green, used for income in "All activity"). */
  value2: number;
  label: string;
}

export interface Entry {
  date: string;
  value: number;
  secondary?: boolean;
}

/** Buckets entries into bars for the period (per day, week or month) and computes the average
 * per elapsed bucket. */
export function buildBars(period: Period, entries: Entry[], weekStartDay: number, now: Date = new Date()): { bars: BarDatum[]; average: number } {
  const from = parseISO(period.from);
  const to = parseISO(period.to);
  const today = toISODate(now);
  const weekStartsOn = (weekStartDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  let keys: string[] = [];
  let keyOf: (date: string) => string;
  let labelOf: (key: string, i: number, n: number) => string;

  if (period.bucket === 'day') {
    keys = eachDayOfInterval({ start: from, end: to }).map(toISODate);
    keyOf = (d) => d;
    const n = keys.length;
    const marks = n === 7 ? null : n <= 31 ? new Set([0, 7, 15, 22, n - 1]) : new Set([0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1]);
    // A week reads "Mon Tue Wed …"; a month marks a few dates.
    labelOf = (k, i) => (marks === null ? format(parseISO(k), 'EEE') : marks.has(i) ? format(parseISO(k), 'd') : '');
  } else if (period.bucket === 'week') {
    let cursor = startOfWeek(from, { weekStartsOn });
    while (cursor <= to) {
      keys.push(toISODate(cursor));
      cursor = addDays(cursor, 7);
    }
    keyOf = (d) => toISODate(startOfWeek(parseISO(d), { weekStartsOn }));
    // Month name under the first week of each month ("Aug", "Sep").
    labelOf = (k, i) => (i === 0 || keys[i - 1].slice(0, 7) !== k.slice(0, 7) ? format(parseISO(k), 'MMM') : '');
  } else if (period.bucket === 'quarter') {
    const year = from.getFullYear();
    keys = [1, 2, 3, 4].map((q) => `${year}-Q${q}`);
    keyOf = (d) => `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
    labelOf = (k) => k.slice(5);
  } else {
    let cursor = startOfMonth(from);
    while (cursor <= to) {
      keys.push(toISODate(cursor).slice(0, 7));
      cursor = addMonths(cursor, 1);
    }
    keyOf = (d) => d.slice(0, 7);
    labelOf = (k, i, n) => {
      const d = parseISO(`${k}-01`);
      // Up to 6 months: every month; a year: every other month; longer: a few, with the year.
      if (n <= 6) return format(d, 'MMM');
      if (n <= 12) return i % 2 === 0 ? format(d, 'MMM') : '';
      const step = Math.ceil(n / 6);
      return i % step === 0 ? format(d, "MMM ''yy") : '';
    };
  }

  const index = new Map(keys.map((k, i) => [k, i]));
  const bars: BarDatum[] = keys.map((k, i) => ({ key: k, value: 0, value2: 0, label: labelOf(k, i, keys.length) }));
  let total = 0;
  for (const e of entries) {
    const i = index.get(keyOf(e.date));
    if (i === undefined) continue;
    if (e.secondary) bars[i].value2 += e.value;
    else bars[i].value += e.value;
    total += e.value;
  }

  // Average over buckets that have started (so a month in progress isn't diluted by future days).
  const currentKey = keyOf(today);
  const currentIndex = index.get(currentKey);
  const elapsed = period.to < today ? keys.length : currentIndex !== undefined ? currentIndex + 1 : period.from > today ? 0 : keys.length;
  const average = elapsed > 0 ? total / elapsed : 0;
  return { bars, average };
}
