import { addMonths, differenceInCalendarDays, endOfMonth, format, isValid, parseISO, startOfMonth } from 'date-fns';

import { toISODate } from '@/lib/format';

/** One month's share of a spread entry. */
export interface SpreadShare {
  /** Date the share is counted on (the first covered day of that month). */
  date: string;
  amount: number;
  /** Days of the range in this month (date-range spreads only). */
  days?: number;
}

export const MAX_SPREAD_MONTHS = 36;
/** Longest date range an entry can be spread over (about three years). */
export const MAX_SPREAD_DAYS = 1100;

/** Splits `amount` into whole-cent parts proportional to `weights`, adding up exactly. */
function splitCents(amount: number, weights: number[]): number[] {
  const cents = Math.round(amount * 100);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (cents * w) / total);
  const parts = raw.map(Math.floor);
  let left = cents - parts.reduce((a, b) => a + b, 0);
  // Largest remainders first, then earliest, so the rounding lands predictably.
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts.map((c) => c / 100);
}

/** Equal shares over `months` calendar months, starting in the entry's month on the same day
 * (clamped to shorter months). */
export function monthShares(amount: number, date: string, months: number): SpreadShare[] {
  const start = parseISO(date);
  const amounts = splitCents(amount, Array.from({ length: months }, () => 1));
  return amounts.map((a, i) => ({ date: toISODate(addMonths(start, i)), amount: a }));
}

/** True for a usable date range: both dates valid, `to` on or after `from`, within the limit. */
export function isValidSpreadRange(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false;
  const f = parseISO(from);
  const t = parseISO(to);
  if (!isValid(f) || !isValid(t)) return false;
  const days = differenceInCalendarDays(t, f) + 1;
  return days >= 1 && days <= MAX_SPREAD_DAYS;
}

/**
 * Shares for a date range (e.g. a per diem covering 27 Aug – 22 Nov): each calendar month gets
 * the part of the amount matching how many of the range's days fall in it, counted on the first
 * covered day of that month.
 */
export function rangeShares(amount: number, from: string, to: string): SpreadShare[] {
  const f = parseISO(from);
  const t = parseISO(to);
  const segments: { date: string; days: number }[] = [];
  for (let m = startOfMonth(f); m <= t; m = addMonths(m, 1)) {
    const segStart = m < f ? f : m;
    const monthEnd = endOfMonth(m);
    const segEnd = monthEnd > t ? t : monthEnd;
    segments.push({ date: toISODate(segStart), days: differenceInCalendarDays(segEnd, segStart) + 1 });
  }
  const amounts = splitCents(amount, segments.map((s) => s.days));
  return segments.map((s, i) => ({ date: s.date, days: s.days, amount: amounts[i] }));
}

/** Short label for a date range, e.g. "27 Aug – 22 Nov" (years shown when they differ from now). */
export function formatSpreadRange(from: string, to: string): string {
  const f = parseISO(from);
  const t = parseISO(to);
  const year = new Date().getFullYear();
  const sameYear = f.getFullYear() === t.getFullYear() && t.getFullYear() === year;
  return sameYear ? `${format(f, 'd MMM')} – ${format(t, 'd MMM')}` : `${format(f, 'd MMM yyyy')} – ${format(t, 'd MMM yyyy')}`;
}
