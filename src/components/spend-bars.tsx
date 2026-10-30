import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { BarDatum } from '@/lib/buckets';
import { compactNumber } from '@/lib/format';
import { C, F, fs } from '@/theme';

interface Props {
  bars: BarDatum[];
  height?: number;
  /** Average value drawn as a dashed line; hidden when 0. */
  average: number;
  hidden?: boolean;
  /** Colour of the primary bars (white by default; a category colour on category pages). */
  color?: string;
  /** Tapping the average value (e.g. to explain how it's calculated). */
  onPressAverage?: () => void;
}

const AXIS_W = 46;
const LABEL_H = 26;
const FS = fs(15);

/** Spend bars over faint full-height columns, with a dashed average line and a right-hand value
 * axis. A secondary value (income) stacks on top in green. */
export const SpendBars = memo(function SpendBars({ bars, height = 250, average, hidden, color = '#FFFFFF', onPressAverage }: Props) {
  const [width, setWidth] = useState(0);
  const chartH = height - LABEL_H;
  const top = 12;
  // Like the reference, the top of the scale sits 20% above the tallest bar (or the average).
  const peak = Math.max(...bars.map((b) => b.value + b.value2), average, 0);
  const max = peak > 0 ? peak * 1.2 : 1;
  const plotW = Math.max(0, width - AXIS_W - 16);
  const n = Math.max(bars.length, 1);
  const slot = plotW / n;
  // Up to 16 bars (week, year, quarters, a few months): wide rounded bars about 6pt apart.
  // More (the days of a month): thin capsules.
  const wide = n <= 16;
  const barW = wide ? Math.max(4, slot - Math.min(8, Math.max(4, slot * 0.12))) : Math.max(2.5, Math.min(7, slot * 0.55));
  const radius = wide ? Math.min(barW * 0.22, barW / 2) : barW / 2;
  const minH = wide ? Math.min(radius * 2, 8) : barW;
  const scale = (v: number) => (chartH - top) * (v / max);
  const avgY = chartH - scale(average);
  const xOf = (i: number) => 16 + i * slot + (slot - barW) / 2;
  // "0" sits level with the bars' base; it only steps aside for the average label.
  const showZero = average <= 0 || chartH - avgY >= 22;

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            {/* Placeholder columns: invisible at the top, brightening toward the base. */}
            <LinearGradient id="column-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={0.025} />
              <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity={0.085} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.055} />
            </LinearGradient>
          </Defs>
          {bars.map((b, i) => (
            <Rect key={`bg${b.key}`} x={xOf(i)} y={top} width={barW} height={chartH - top} rx={radius} fill="url(#column-fade)" />
          ))}
          {bars.map((b, i) => {
            const total = b.value + b.value2;
            if (total <= 0) return null;
            const h = Math.max(minH, scale(total));
            const h1 = total > 0 ? (h * b.value) / total : 0;
            return (
              <G key={b.key}>
                {b.value2 > 0 ? (
                  <Rect x={xOf(i)} y={chartH - h} width={barW} height={h} rx={Math.min(radius, h / 2)} fill={C.green} opacity={hidden ? 0.25 : 1} />
                ) : null}
                {b.value > 0 ? (
                  <Rect x={xOf(i)} y={chartH - Math.max(minH, h1)} width={barW} height={Math.max(minH, h1)} rx={Math.min(radius, Math.max(minH, h1) / 2)} fill={color} opacity={hidden ? 0.25 : 1} />
                ) : null}
              </G>
            );
          })}
          {average > 0 ? (
            <>
              <Line x1={16} x2={16 + plotW} y1={avgY} y2={avgY} stroke="#FFFFFF" strokeWidth={1} strokeDasharray="4 4" />
              <SvgText x={width - AXIS_W + 8} y={avgY + 5} fill={C.text} fontSize={FS} fontFamily={F.regular}>
                {hidden ? '•••' : compactNumber(average)}
              </SvgText>
              <Line x1={width - AXIS_W + 8} x2={width - 8} y1={avgY + 12} y2={avgY + 12} stroke={C.text2} strokeWidth={1} strokeDasharray="4 3" />
            </>
          ) : null}
          <SvgText x={width - AXIS_W + 8} y={top + 8} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
            {hidden ? '•••' : axisNumber(max)}
          </SvgText>
          {showZero ? (
            <SvgText x={width - AXIS_W + 8} y={chartH + FS * 0.35} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
              0
            </SvgText>
          ) : null}
          {bars.map((b, i) =>
            b.label ? (
              <SvgText key={`l${b.key}`} x={16 + i * slot + slot / 2} y={height - 4} fill={C.text2} fontSize={FS} fontFamily={F.regular} textAnchor="middle">
                {b.label}
              </SvgText>
            ) : null
          )}
        </Svg>
      ) : null}
      {width > 0 && average > 0 && onPressAverage ? (
        <Pressable
          onPress={onPressAverage}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How the average is calculated"
          style={[styles.avgHit, { left: width - AXIS_W - 4, top: avgY - 16 }]}
        />
      ) : null}
    </View>
  );
});

/** Scale labels as in the reference: "558", "1.36k", "2.50k". */
function axisNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return String(Math.round(v));
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  avgHit: { position: 'absolute', width: AXIS_W + 4, height: 34 },
});
