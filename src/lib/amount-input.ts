import { CURRENCY_FORMATS, type CurrencyFormatId } from '@/lib/format';

/** Parses a user-typed amount in the current currency format ("1 234,56" or "1,234.56"). */
export function parseAmountInput(text: string, fmt: CurrencyFormatId): number | null {
  const { decimal } = CURRENCY_FORMATS[fmt];
  let s = text.replace(/[\s  ]/g, '');
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function amountToInput(value: number, fmt: CurrencyFormatId): string {
  const { decimal } = CURRENCY_FORMATS[fmt];
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return decimal === ',' ? s.replace('.', ',') : s;
}
