/** Rounds a chart maximum up to a "nice" number (1, 2, 2.5, 5, 10 × 10^n). */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= m * base) return m * base;
  }
  return 10 * base;
}
