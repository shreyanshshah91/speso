/**
 * Font size at which a single line of `length` characters fits `width` points, between `min` and
 * `max`. Uses the measured average glyph width of Outfit (~0.5em), so it behaves the same on web,
 * where `adjustsFontSizeToFit` isn't supported, and on native.
 */
export function fitFontSize(length: number, width: number, max: number, min = 10.5): number {
  if (width <= 0 || length <= 0) return max;
  const size = width / (length * 0.5);
  return Math.max(min, Math.min(max, Math.floor(size * 2) / 2));
}

/**
 * One shared font size for a grid of labels, fitted so every label of up to `oneLineChars`
 * characters shows in full (between `min` and `max`); longer names end with an ellipsis. Keeping
 * every tile at one size avoids a ragged mix of large and small labels.
 */
export function uniformLabelSize(labels: string[], width: number, max: number, min = 12, oneLineChars = 11): number {
  const longest = labels.reduce((m, l) => {
    const n = [...l].length;
    return n <= oneLineChars ? Math.max(m, n) : m;
  }, 1);
  return fitFontSize(longest, width, max, min);
}

