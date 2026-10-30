/** Design tokens. The app is dark-only; every surface is a translucent layer over a dark gradient. */
import { Dimensions } from 'react-native';

export const C = {
  // Sampled from the reference: near-flat dark slate that deepens toward the bottom.
  bgTop: '#1F262C',
  bgBottom: '#111518',
  bgBlueTop: '#1F4154',
  bgTealTop: '#1C3D3B',

  text: '#FFFFFF',
  text2: '#9AA1A7',
  text3: '#6E767C',

  card: 'rgba(255,255,255,0.07)',
  cardStrong: 'rgba(255,255,255,0.10)',
  divider: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.10)',
  pill: 'rgba(255,255,255,0.08)',
  pillActive: 'rgba(255,255,255,0.18)',
  badge: 'rgba(255,255,255,0.09)',

  sheet: '#1D242A',
  sheetRaised: '#2A3137',
  key: '#2A3135',
  keyPressed: '#3A4246',

  red: '#F0616D',
  green: '#35C77A',
  greenLight: '#8CF0B8',
  blue: '#33AEFF',
  blueLight: '#8FDBFF',
  purple: '#B966F5',
  purpleLight: '#F0A6FF',
  calendarOn: '#2E6FAE',
  calendarOnLight: '#3F88CC',

  tealStart: '#07606F',
  tealEnd: '#14C4A2',
  tealText: '#27D3B0',

  fab: '#D9DBDD',
  black: '#000000',
  tabActive: '#0A0C0D',
} as const;

export const F = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semiBold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

export const R = {
  sm: 12,
  md: 18,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const S = {
  gutter: 16,
  row: 64,
} as const;


/** Colours offered when creating a category or account. */
export const PALETTE = [
  '#818BF7',
  '#11B7FD',
  '#F46674',
  '#F5C544',
  '#F49763',
  '#EC7FD0',
  '#5BC8E8',
  '#A78BFA',
  '#3DD9C4',
  '#F2789F',
  '#35C77A',
  '#9CA3AF',
  '#FF8A3D',
  '#6EE7B7',
  '#60A5FA',
  '#E879F9',
] as const;

// ---- Responsive sizing ---------------------------------------------------------------------
// The design is drawn for a 393pt-wide phone. Type and a few fixed sizes follow the screen
// gently (60% of the width difference, clamped) so small Androids don't overflow and large
// phones don't look sparse. Orientation is locked to portrait, so the short side is the width.

const WINDOW = Dimensions.get('window');
const SHORT_SIDE = Math.min(WINDOW.width, WINDOW.height);
const LONG_SIDE = Math.max(WINDOW.width, WINDOW.height);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Multiplier applied to font sizes and fixed dimensions (1 on a 393pt-wide phone). */
export const UI_SCALE = clamp(1 + (SHORT_SIDE / 393 - 1) * 0.6, 0.86, 1.06);

/** Scales a font size, keeping half-point precision. */
export const fs = (n: number) => Math.round(n * UI_SCALE * 2) / 2;

/** Scales a fixed dimension (icon, tile, control size). */
export const sz = (n: number) => Math.round(n * UI_SCALE);

/** Height for the main charts: shorter on short screens so the list below stays reachable. */
export const CHART_H = Math.round(clamp(LONG_SIDE * 0.29, 196, 250));

/** Height of a keypad key on the add-transaction screen, sized to the screen height. */
export const KEY_H = Math.round(clamp(LONG_SIDE * 0.07, 46, 62));

/**
 * Side margin of the floating tab bar: a little inside the 16pt card margin, so the bar sits
 * within the cards' edges like the reference (~21pt on a 393pt screen).
 */
export const TAB_BAR_SIDE = SHORT_SIDE < 375 ? 19 : 21;
