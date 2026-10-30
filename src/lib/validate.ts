/** Input limits shared by forms, CSV import and backup restore. */
export const LIMITS = {
  name: 60,
  note: 200,
  maxAmount: 1_000_000_000_000,
  importBytes: 20 * 1024 * 1024,
  importRows: 200_000,
} as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // Strip control characters (keeps emoji and all printable Unicode).
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= LIMITS.maxAmount;
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_RE.test(value);
}

/** An icon is a short emoji / symbol string, never arbitrary text. */
export function cleanIcon(value: unknown, fallback: string): string {
  const s = cleanText(value, 16);
  return s.length > 0 ? s : fallback;
}
