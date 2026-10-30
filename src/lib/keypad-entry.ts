import type { KeypadKey } from '@/components/keypad';
import { isOperator } from '@/lib/calculator';
import { CURRENCY_FORMATS, formatNumber } from '@/lib/format';

/** Keypad amount entry shared by the add-transaction screen and the account balance editor. */

const MAX_DIGITS = 10;

export function trimAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Applies a keypad key to the raw expression (digits, '.', + - × ÷). */
export function applyKey(prev: string, k: KeypadKey): string {
  const last = prev.slice(-1);
  const current = prev.split(/[+\-×÷]/).pop() ?? '';
  if (k === 'dec') {
    if (current.includes('.')) return prev;
    return prev + (current === '' ? '0.' : '.');
  }
  if (k === '+' || k === '-' || k === '×' || k === '÷') {
    if (prev === '') return prev;
    if (isOperator(last)) return prev.slice(0, -1) + k;
    if (last === '.') return prev.slice(0, -1) + k;
    return prev + k;
  }
  // Digit.
  const [, frac] = current.split('.');
  if (frac !== undefined && frac.length >= 2) return prev;
  if (current.replace('.', '').length >= MAX_DIGITS) return prev;
  if (current === '0') return prev.slice(0, -1) + k;
  return prev + k;
}

/** Formats the raw expression for display with grouping and the locale decimal separator. */
export function renderExpr(expr: string, fmt: Parameters<typeof formatNumber>[1]): string {
  if (!expr) return '0';
  const { decimal } = CURRENCY_FORMATS[fmt];
  return expr
    .split(/([+\-×÷])/)
    .map((part) => {
      if (part === '-') return ' − ';
      if (part === '+' || part === '×' || part === '÷') return ` ${part} `;
      if (part === '') return '';
      const [int, frac] = part.split('.');
      const grouped = formatNumber(Number(int || '0'), fmt, 0);
      return frac !== undefined ? `${grouped}${decimal}${frac}` : grouped;
    })
    .join('');
}

