import { format, isSameDay, isSameYear, parseISO, subDays } from 'date-fns';

import { currencySymbol } from '@/lib/currencies';

/** How digits are grouped and which decimal mark is used. */
export type NumberFormatId = 'comma_dot' | 'dot_comma' | 'space_comma' | 'space_dot';
/** Where the currency symbol goes: "R1 234", "R 1 234" or "1 234 R". */
export type CurrencyPosition = 'before' | 'before_space' | 'after';
/** A number format plus a symbol position, e.g. "space_comma.before_space". */
export type CurrencyFormatId = `${NumberFormatId}.${CurrencyPosition}`;

interface FormatSpec {
  group: string;
  decimal: string;
  after: boolean;
  space: boolean;
}

// U+202F narrow no-break space keeps "R 1 234" from wrapping mid-number.
const NB = '\u202F';

export const NUMBER_FORMATS: Record<NumberFormatId, { group: string; decimal: string }> = {
  comma_dot: { group: ',', decimal: '.' },
  dot_comma: { group: '.', decimal: ',' },
  space_comma: { group: NB, decimal: ',' },
  space_dot: { group: NB, decimal: '.' },
};
export const NUMBER_FORMAT_IDS = Object.keys(NUMBER_FORMATS) as NumberFormatId[];
export const CURRENCY_POSITIONS: CurrencyPosition[] = ['before', 'before_space', 'after'];

export const CURRENCY_FORMATS = Object.fromEntries(
  NUMBER_FORMAT_IDS.flatMap((n) =>
    CURRENCY_POSITIONS.map((p) => [`${n}.${p}`, { ...NUMBER_FORMATS[n], after: p === 'after', space: p !== 'before' }])
  )
) as Record<CurrencyFormatId, FormatSpec>;

export function splitFormat(id: CurrencyFormatId): { number: NumberFormatId; position: CurrencyPosition } {
  const [number, position] = id.split('.') as [NumberFormatId, CurrencyPosition];
  return { number, position };
}

export function joinFormat(number: NumberFormatId, position: CurrencyPosition): CurrencyFormatId {
  return `${number}.${position}`;
}

// Presets saved by earlier versions, before number format and symbol position were separate.
const LEGACY: Record<string, CurrencyFormatId> = {
  space_comma: 'space_comma.before_space',
  comma_dot: 'comma_dot.before',
  comma_dot_space: 'comma_dot.before_space',
  dot_comma: 'dot_comma.before_space',
  space_comma_after: 'space_comma.after',
  dot_comma_after: 'dot_comma.after',
};

/** A stored value as a current format id (upgrading older presets), or null if unusable. */
export function normalizeFormatId(v: unknown): CurrencyFormatId | null {
  if (typeof v !== 'string') return null;
  if (v in CURRENCY_FORMATS) return v as CurrencyFormatId;
  return LEGACY[v] ?? null;
}

export function isCurrencyFormatId(v: unknown): v is CurrencyFormatId {
  return typeof v === 'string' && v in CURRENCY_FORMATS;
}

/** Picks the preset closest to the device locale's own number formatting. */
export function guessCurrencyFormat(): CurrencyFormatId {
  try {
    const parts = new Intl.NumberFormat().formatToParts(12345.6);
    const group = parts.find((p) => p.type === 'group')?.value ?? ',';
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    if (decimal === ',') return group === '.' ? 'dot_comma.before_space' : 'space_comma.before_space';
    return 'comma_dot.before';
  } catch {
    return 'comma_dot.before';
  }
}

function groupDigits(int: string, sep: string): string {
  let out = '';
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) out += sep;
    out += int[i];
  }
  return out;
}

export function formatNumber(value: number, fmt: CurrencyFormatId, decimals: number): string {
  const spec = CURRENCY_FORMATS[fmt];
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  return groupDigits(int, spec.group) + (frac ? spec.decimal + frac : '');
}

export interface MoneyOptions {
  cents: boolean;
  format: CurrencyFormatId;
  /** Show a leading "+" for positive values. */
  signed?: boolean;
  /** Overrides the number of decimals (e.g. for exchange rates). */
  decimals?: number;
}

export function formatMoney(amount: number, code: string, opts: MoneyOptions): string {
  const spec = CURRENCY_FORMATS[opts.format];
  const decimals = opts.decimals ?? (opts.cents ? 2 : 0);
  const rounded = Number(amount.toFixed(decimals));
  const sign = rounded < 0 ? '-' : opts.signed && rounded > 0 ? '+' : '';
  const body = formatNumber(rounded, opts.format, decimals);
  const symbol = currencySymbol(code);
  const gap = spec.space ? ' ' : '';
  return spec.after ? `${sign}${body}${gap}${symbol}` : `${sign}${symbol}${gap}${body}`;
}

export function maskedMoney(code: string, fmt: CurrencyFormatId): string {
  const spec = CURRENCY_FORMATS[fmt];
  const symbol = currencySymbol(code);
  return spec.after ? `••••${spec.space ? ' ' : ''}${symbol}` : `${symbol}${spec.space ? ' ' : ''}••••`;
}

/** Axis-friendly short numbers: 950, 1.2k, 44k, 1.3M. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  if (abs >= 100 || Number.isInteger(abs)) return `${sign}${Math.round(abs)}`;
  return `${sign}${abs.toFixed(1)}`;
}

function trim(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** "Today", "Yesterday", "Tuesday, 22 Sep" or "Tue, 22 Sep 2025". */
export function formatDayHeader(isoDate: string, now: Date = new Date()): string {
  const date = parseISO(isoDate);
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  return format(date, isSameYear(date, now) ? 'EEEE, d MMM' : 'EEE, d MMM yyyy');
}

/** Chip label for the date picker on the add screen. */
export function formatDateChip(isoDate: string, now: Date = new Date()): string {
  const date = parseISO(isoDate);
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  return format(date, isSameYear(date, now) ? 'd MMM' : 'd MMM yyyy');
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
