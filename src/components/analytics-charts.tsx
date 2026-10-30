import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { niceMax } from '@/lib/chart';
import { compactNumber } from '@/lib/format';
import { C, F, fs } from '@/theme';

export interface Bucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  /** Hasn't started yet: drawn empty and left out of the average. */
  future?: boolean;
}

const AXIS_W = 44;
const LABELS_H = 40;
const FS = fs(15);

type Palette = 'green' | 'blue' | 'purple';

/**
 * Bar colours measured from the reference: a saturated body, lighter rims that fade in from each
 * side, and a short bright glow at the base. Every bar also starts dark at the top (`shade`, about
 * a third of its colour) and brightens downwards, as the purple "income left" bars always have. `top`/`bottom`/`edge` feed the legend chips.
 */
export const PALETTES: Record<Palette, { body: string; rim: string; base: string; shade?: string; stub: string; top: string; bottom: string; edge: string }> = {
  green: { body: '#34BA6D', rim: '#7AEDAE', base: '#A0FFD8', shade: '#134327', stub: '#8FEDBA', top: '#34BA6D', bottom: '#8CF5C2', edge: '#7AEDAE' },
  blue: { body: '#33A4FC', rim: '#80DDF9', base: '#A0FFFF', shade: '#123B5B', stub: '#95DDFF', top: '#33A4FC', bottom: '#8FE6FF', edge: '#80DDF9' },
  purple: { body: '#B869F3', rim: '#F4A7FF', base: '#FFC6FF', shade: '#432758', stub: '#EBD3FA', top: '#9153C2', bottom: '#F4A0FF', edge: '#F4A7FF' },
};

/** Shared gradient definitions for the bars (bounding-box units, so one set serves every bar). */
function GlassDefs({ palettes }: { palettes: Palette[] }) {
  return (
    <Defs>
      {palettes.map((p) => (
        <LinearGradient key={`r${p}`} id={`rim-${p}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={PALETTES[p].rim} stopOpacity={1} />
          <Stop offset="0.45" stopColor={PALETTES[p].rim} stopOpacity={0} />
          <Stop offset="0.55" stopColor={PALETTES[p].rim} stopOpacity={0} />
          <Stop offset="1" stopColor={PALETTES[p].rim} stopOpacity={1} />
        </LinearGradient>
      ))}
      {palettes.map((p) => (
        <LinearGradient key={`b${p}`} id={`base-${p}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={PALETTES[p].base} stopOpacity={0} />
          <Stop offset="1" stopColor={PALETTES[p].base} stopOpacity={0.95} />
        </LinearGradient>
      ))}
      {palettes
        .filter((p) => PALETTES[p].shade)
        .map((p) => (
          <LinearGradient key={`s${p}`} id={`shade-${p}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PALETTES[p].shade} stopOpacity={1} />
            <Stop offset="0.55" stopColor={PALETTES[p].shade} stopOpacity={0} />
          </LinearGradient>
        ))}
    </Defs>
  );
}

/**
 * One bar in the reference style: rounded-rectangle ends (not a full capsule), saturated body,
 * soft light rims, a darker top where the palette has one, and light pooling at the base.
 */
function GlassBar({ x, y, w, h, palette }: { x: number; y: number; w: number; h: number; palette: Palette }) {
  const r = Math.min(w * 0.28, h / 2);
  const p = PALETTES[palette];
  // The base glow is a short band (about 40% of the width tall), whatever the bar's height.
  const glowH = Math.min(h * 0.45, Math.max(7, w * 0.42));
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={r} fill={p.body} />
      <Rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#rim-${palette})`} opacity={0.85} />
      {p.shade ? <Rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#shade-${palette})`} /> : null}
      <Rect x={x} y={y + h - glowH} width={w} height={glowH} rx={Math.min(r, glowH / 2)} fill={`url(#base-${palette})`} />
      {/* A faint dark outline lifts the bar off the card, as in the reference. */}
      <Rect x={x - 0.5} y={y - 0.5} width={w + 1} height={h + 1} rx={r + 0.5} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={1} />
    </G>
  );
}

/** Legend chip drawn exactly like a bar (same body, rims, base glow and outline), in miniature. */
export function BarSwatch({ palette, size = 13 }: { palette: Palette; size?: number }) {
  return (
    <Svg width={size + 1} height={size + 1}>
      <GlassDefs palettes={[palette]} />
      <GlassBar x={0.5} y={0.5} w={size} h={size} palette={palette} />
    </Svg>
  );
}

/** Flat pill shown for a zero value. */
function Stub({ x, y, w, palette, dim }: { x: number; y: number; w: number; palette: Palette; dim?: boolean }) {
  return <Rect x={x} y={y} width={w} height={5} rx={2.5} fill={PALETTES[palette].stub} opacity={dim ? 0.45 : 1} />;
}

interface BarsProps {
  buckets: Bucket[];
  selected: number;
  onSelect: (i: number) => void;
  height?: number;
  hidden?: boolean;
}

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width)] as const;
}

/**
 * Month (period) labels under the bars, with the selected one in a rounded highlight. Drawn in
 * SVG, like the bars and axis, so the highlight's size, corners and centring are identical on
 * every platform (Android view backgrounds kept losing their rounded corners). Transparent
 * buttons on top handle taps.
 */
function BucketLabels({ buckets, selected, onSelect, slot }: { buckets: Bucket[]; selected: number; onSelect: (i: number) => void; slot: number }) {
  const size = fs(slot < 40 ? 13 : slot < 46 ? 14 : 16);
  // One highlight size for every label (sized for the longest), like the reference: ~38 x 22pt.
  const longest = buckets.reduce((m, b) => Math.max(m, [...b.label].length), 3);
  const pillW = Math.min(slot - 2, longest * size * 0.62 + 16);
  const pillH = Math.round(size + 9);
  const cy = LABELS_H / 2;
  const width = slot * buckets.length;
  return (
    <View style={[styles.labels, { width }]}>
      <Svg width={width} height={LABELS_H} style={styles.labelsSvg} pointerEvents="none">
        {buckets.map((b, i) => {
          const cx = i * slot + slot / 2;
          const on = i === selected;
          return (
            <G key={b.key}>
              <Rect x={cx - pillW / 2} y={cy - pillH / 2} width={pillW} height={pillH} rx={7} fill="#FFFFFF" opacity={on ? 0.2 : 0} />
              <SvgText x={cx} y={cy + size * 0.36} textAnchor="middle" fontSize={size} fontFamily={F.regular} fill={on ? C.text : C.text2}>
                {b.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {buckets.map((b, i) => (
        <Pressable
          key={b.key}
          onPress={() => onSelect(i)}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          accessibilityState={{ selected: i === selected }}
          style={{ width: slot, height: LABELS_H }}
        />
      ))}
    </View>
  );
}

function AxisLabels({ width, top, chartH, max, mid, hidden, midLabel }: { width: number; top: number; chartH: number; max: string; mid?: number; hidden?: boolean; midLabel?: string }) {
  const x = width - AXIS_W + 10;
  return (
    <>
      <SvgText x={x} y={top + 10} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
        {hidden ? '•••' : max}
      </SvgText>
      {mid !== undefined && midLabel ? (
        <SvgText x={x} y={mid + 5} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
          {hidden ? '•••' : midLabel}
        </SvgText>
      ) : null}
      <SvgText x={x} y={chartH} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
        0
      </SvgText>
    </>
  );
}

/** Axis value for half the scale; whole numbers below 1,000 round down, as in the reference ("232"). */
const halfLabel = (max: number) => compactNumber(max < 1000 ? Math.floor(max / 2) : max / 2);

/** Side-by-side income (green) and expense (blue) glass bars per period. */
export const IncomeExpenseBars = memo(function IncomeExpenseBars({ buckets, selected, onSelect, height = 250, hidden }: BarsProps) {
  const [width, onLayout] = useWidth();
  const plotW = Math.max(0, width - AXIS_W);
  const slot = plotW / Math.max(buckets.length, 1);
  // Bar width measured on the reference: ~11pt with 7 bars, ~14pt with 6, ~25pt with 4.
  const barW = Math.max(5, Math.min(30, slot * 0.49 - 9.4));
  const chartH = height - LABELS_H;
  const top = 12;
  // The scale tops out at the tallest bar, which reaches the top label.
  const peak = Math.max(0, ...buckets.flatMap((b) => [b.income, b.expense]));
  const max = peak > 0 ? peak : 1;
  // Small values still read as a capsule rather than a dot.
  const h = (v: number) => (v > 0 ? Math.max(Math.min(barW + 10, (chartH - top) * 0.12), (chartH - top) * (v / max)) : 0);

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={chartH + 6}>
            <GlassDefs palettes={['green', 'blue']} />
            {buckets.map((b, i) => {
              const cx = i * slot + slot / 2;
              const xi = cx - barW - 1;
              const xe = cx + 1;
              const hi = h(b.income);
              const he = h(b.expense);
              return (
                <G key={b.key}>
                  {hi > 0 ? <GlassBar x={xi} y={chartH - hi} w={barW} h={hi} palette="green" /> : <Stub x={xi} y={chartH - 5} w={barW} palette="green" />}
                  {he > 0 ? <GlassBar x={xe} y={chartH - he} w={barW} h={he} palette="blue" /> : <Stub x={xe} y={chartH - 5} w={barW} palette="blue" />}
                </G>
              );
            })}
            <AxisLabels width={width} top={top} chartH={chartH} max={compactNumber(peak)} mid={top + (chartH - top) / 2} midLabel={halfLabel(peak)} hidden={hidden} />
          </Svg>
          <BucketLabels buckets={buckets} selected={selected} onSelect={onSelect} slot={slot} />
        </>
      ) : null}
    </View>
  );
});

/** "Income left" glass bars: income minus expenses per period (or savings rate %). */
export const IncomeLeftBars = memo(function IncomeLeftBars({
  buckets,
  selected,
  onSelect,
  height = 250,
  percent,
  hidden,
}: BarsProps & { percent: boolean }) {
  const [width, onLayout] = useWidth();
  const plotW = Math.max(0, width - AXIS_W);
  const slot = plotW / Math.max(buckets.length, 1);
  const barW = Math.min(38, slot * 0.72);
  const chartH = height - LABELS_H;
  const top = 12;
  const values = buckets.map((b) => (percent ? (b.income > 0 ? ((b.income - b.expense) / b.income) * 100 : 0) : b.income - b.expense));
  const positives = values.filter((v) => v > 0);
  const max = percent ? 100 : niceMax(Math.max(1, ...values));
  // Average over the periods that have started (future ones left out), like the reference.
  const elapsed = values.filter((_, i) => !buckets[i].future);
  const avg = elapsed.length ? elapsed.reduce((a, b) => a + b, 0) / elapsed.length : 0;
  const y = (v: number) => top + (chartH - top) * (1 - Math.min(v, max) / max);
  const avgY = y(avg);
  const labelX = width - AXIS_W + 10;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={chartH + 6}>
            <GlassDefs palettes={['purple']} />
            {values.map((v, i) => {
              const x = i * slot + (slot - barW) / 2;
              if (v <= 0) return <Stub key={i} x={x} y={chartH - 5} w={barW} palette="purple" dim={v < 0 || i === selected} />;
              const hh = Math.max(Math.min(barW, 28), chartH - y(v));
              return <GlassBar key={i} x={x} y={chartH - hh} w={barW} h={hh} palette="purple" />;
            })}
            {avg > 0 ? (
              <>
                <Line x1={0} x2={plotW} y1={avgY} y2={avgY} stroke="#FFFFFF" strokeWidth={1} strokeDasharray="4 4" />
                <SvgText x={labelX} y={avgY + 5} fill={C.text} fontSize={FS} fontFamily={F.regular}>
                  {hidden ? '•••' : percent ? `${Math.round(avg)}%` : compactNumber(avg)}
                </SvgText>
                {/* Short dashed underline under the average value, as in the Activity chart. */}
                <Line x1={labelX} x2={width - 6} y1={avgY + 12} y2={avgY + 12} stroke={C.text2} strokeWidth={1} strokeDasharray="4 3" />
              </>
            ) : null}
            {/* Max label, hidden if the average label would sit on top of it. */}
            {(positives.length > 0 || percent) && !(avg > 0 && avgY - (top + 10) < 22) ? (
              <SvgText x={labelX} y={top + 10} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
                {hidden ? '•••' : percent ? '100%' : compactNumber(max)}
              </SvgText>
            ) : null}
            {/* Zero label, hidden if it would collide with the average label and its underline. */}
            {!(avg > 0 && chartH - avgY < 30) ? (
              <SvgText x={labelX} y={chartH} fill={C.text2} fontSize={FS} fontFamily={F.regular}>
                0
              </SvgText>
            ) : null}
          </Svg>
          <BucketLabels buckets={buckets} selected={selected} onSelect={onSelect} slot={slot} />
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', height: LABELS_H },
  labelsSvg: { position: 'absolute', left: 0, top: 0 },
});
