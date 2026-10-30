import { useId } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C } from '@/theme';

/**
 * Background styles, with colour stops sampled from the reference screenshots:
 * - `default`: Summary, Analytics, Budget, Accounts — slate at the top deepening to near-black.
 * - `blue`: Activity — a blue top with a soft brighter glow at the top centre.
 * - `teal`: first-launch screens — the default with a teal glow.
 * - `sheet`: Settings and other modal pages — flat slate for the top half, then fading dark.
 */
type Tint = 'default' | 'blue' | 'teal' | 'sheet';
type Stops = [number, string][];

const TAIL: Stops = [
  [0.62, '#171C20'],
  [0.81, '#121619'],
  [0.92, '#0E1215'],
  [1, '#07090B'],
];

const LINEAR: Record<Tint, Stops> = {
  default: [[0, '#283339'], [0.25, '#212A2F'], [0.44, '#1B2326'], [0.53, '#182023'], ...TAIL],
  teal: [[0, '#283339'], [0.25, '#212A2F'], [0.44, '#1B2326'], [0.53, '#182023'], ...TAIL],
  blue: [
    [0, '#22404F'],
    [0.11, '#203D4D'],
    [0.21, '#1F3948'],
    [0.29, '#1D3340'],
    [0.375, '#1C2A33'],
    [0.45, '#1B262B'],
    [0.53, '#182023'],
    ...TAIL,
  ],
  sheet: [
    [0, '#283339'],
    [0.55, '#283339'],
    [0.625, '#232C31'],
    [0.72, '#1D242A'],
    [0.81, '#181D21'],
    [0.9, '#121619'],
    [1, '#07080A'],
  ],
};

/** Soft glow: colour, peak opacity, centre height and size, as fractions of the screen. */
const GLOW: Partial<Record<Tint, { color: string; opacity: number; cy: number; rx: number; ry: number }>> = {
  blue: { color: '#1A4E6B', opacity: 0.9, cy: 0, rx: 0.62, ry: 0.4 },
  teal: { color: '#1D4644', opacity: 0.8, cy: 0.3, rx: 0.8, ry: 0.32 },
};

interface ScreenProps {
  tint?: Tint;
  /** Custom top colour (e.g. a category colour), blended into the default background. */
  topColor?: string;
  /** Apply the top safe-area inset as padding (default true). */
  padTop?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Full-bleed background shared by every screen. */
export function Screen({ tint = 'default', topColor, padTop = true, style, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // SVG gradient ids are document-wide on web, so each screen gets its own.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');

  const stops: Stops = topColor
    ? [[0, mixHex(topColor, '#283339', 0.6)], [0.3, mixHex(topColor, '#1E262B', 0.8)], [0.53, '#182023'], ...TAIL]
    : LINEAR[tint];
  const glow = topColor ? undefined : GLOW[tint];

  return (
    <View style={styles.root}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
            {stops.map(([offset, color]) => (
              <Stop key={offset} offset={offset} stopColor={color} />
            ))}
          </LinearGradient>
          {glow ? (
            <RadialGradient
              id={`glow${id}`}
              gradientUnits="userSpaceOnUse"
              cx={width / 2}
              cy={height * glow.cy}
              rx={width * glow.rx}
              ry={height * glow.ry}
              fx={width / 2}
              fy={height * glow.cy}>
              <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
              <Stop offset="0.6" stopColor={glow.color} stopOpacity={glow.opacity * 0.4} />
              <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#bg${id})`} />
        {glow ? <Rect x={0} y={0} width={width} height={height} fill={`url(#glow${id})`} /> : null}
      </Svg>
      <View style={[styles.content, padTop && { paddingTop: insets.top }, style]}>{children}</View>
    </View>
  );
}

/** Blends two #RRGGBB colours; t = 0 gives `a`, t = 1 gives `b`. */
function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return b;
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bgBottom },
  content: { flex: 1 },
});
