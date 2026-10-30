import { memo, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

export interface DonutSegment {
  key: string | number;
  value: number;
  color: string;
}

interface DonutProps {
  size: number;
  thickness: number;
  segments: DonutSegment[];
  /** Gap between segments, in px along the outer edge. */
  gap?: number;
  /** Corner radius of each segment's ends. */
  corner?: number;
  trackColor?: string;
  /** Change this value to replay the spin-in animation (e.g. when the screen gains focus). */
  animateKey?: number;
}

const SPIN_MS = 900;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function polar(cx: number, cy: number, r: number, a: number) {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

/** Annular segment from angle a0 to a1 (radians, clockwise from 12 o'clock) with softly rounded corners. */
function segmentPath(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number, corner: number): string {
  const sweep = a1 - a0;
  const c = Math.min(corner, (ro - ri) / 2, (sweep * ri) / 2);
  const dO = c / ro;
  const dI = c / ri;
  const large = sweep - 2 * dO > Math.PI ? 1 : 0;
  const largeI = sweep - 2 * dI > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => polar(cx, cy, r, a).map((v) => v.toFixed(2)).join(' ');
  return [
    `M ${p(ro, a0 + dO)}`,
    `A ${ro} ${ro} 0 ${large} 1 ${p(ro, a1 - dO)}`,
    `Q ${p(ro, a1)} ${p(ro - c, a1)}`,
    `L ${p(ri + c, a1)}`,
    `Q ${p(ri, a1)} ${p(ri, a1 - dI)}`,
    `A ${ri} ${ri} 0 ${largeI} 0 ${p(ri, a0 + dI)}`,
    `Q ${p(ri, a0)} ${p(ri + c, a0)}`,
    `L ${p(ro - c, a0)}`,
    `Q ${p(ro, a0)} ${p(ro, a0 + dO)}`,
    'Z',
  ].join(' ');
}

/** Segmented ring chart with gaps and rounded segment ends. */
export const Donut = memo(function Donut({
  size,
  thickness,
  segments,
  gap = 14,
  corner = 7,
  trackColor = 'rgba(255,255,255,0.08)',
  animateKey,
}: DonutProps) {
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(1);

  // Spin-in: segments grow from nothing while the whole ring rotates into place.
  useEffect(() => {
    if (animateKey === undefined || reduceMotion) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / SPIN_MS);
      setProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animateKey, reduceMotion]);

  const paths = useMemo(() => {
    const cx = size / 2;
    const cy = size / 2;
    const ro = size / 2;
    const ri = ro - thickness;
    const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
    const visible = segments.filter((s) => s.value > 0);
    if (total <= 0 || visible.length === 0) return [];
    const p = progress;
    const gapA = visible.length > 1 ? (gap / ro) * p : 0;
    // While animating, the ring starts rotated back and swings into its resting position.
    const start = -Math.PI / 2 - (1 - p) * Math.PI * 0.9;
    const full = Math.PI * 2 * p;
    // Each share's slot (its arc plus one gap). A tiny share still gets a visible, rounded sliver,
    // and the room for it comes out of the others, so it never covers a gap or its neighbour.
    const minSlot = Math.min(((corner * 2.2) / ri) * p + gapA, full / visible.length);
    const slots = visible.map((s) => (s.value / total) * full);
    const fixed = new Set<number>();
    for (let pass = 0; pass < visible.length; pass++) {
      const restValue = visible.reduce((a, s, i) => (fixed.has(i) ? a : a + s.value), 0);
      const restAngle = full - fixed.size * minSlot;
      let changed = false;
      visible.forEach((s, i) => {
        slots[i] = fixed.has(i) ? minSlot : restValue > 0 ? (s.value / restValue) * restAngle : 0;
        if (!fixed.has(i) && slots[i] < minSlot) {
          fixed.add(i);
          changed = true;
        }
      });
      if (!changed) break;
    }
    let cursor = start + gapA / 2;
    const out: { key: string | number; color: string; d: string | null }[] = [];
    for (const [i, s] of visible.entries()) {
      const sweepFull = slots[i];
      const sweep = sweepFull - gapA;
      const a0 = cursor;
      cursor += sweepFull;
      if (sweep <= 0.001) continue;
      const single = visible.length === 1;
      if (single && p >= 1) {
        out.push({ key: s.key, color: s.color, d: null });
        continue;
      }
      const a1 = single ? a0 + Math.min(sweep, Math.PI * 2 - 0.0001) : a0 + sweep;
      out.push({ key: s.key, color: s.color, d: segmentPath(cx, cy, ro, ri, a0, a1, Math.min(corner, corner * p * 2)) });
    }
    return out;
  }, [size, thickness, segments, gap, corner, progress]);

  const r = size / 2 - thickness / 2;
  return (
    <Svg width={size} height={size}>
      {paths.length === 0 ? (
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" />
      ) : (
        paths.map((p) =>
          p.d ? (
            <Path key={p.key} d={p.d} fill={p.color} />
          ) : (
            <Circle key={p.key} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={thickness} fill="none" />
          )
        )
      )}
    </Svg>
  );
});

interface ProgressRingProps {
  size: number;
  thickness: number;
  /** 0..1 of the ring that is filled. */
  progress: number;
  color: string;
  trackColor?: string;
}

/** Single-value progress ring with round caps (budget rings). */
export const ProgressRing = memo(function ProgressRing({
  size,
  thickness,
  progress,
  color,
  trackColor = 'rgba(255,255,255,0.14)',
}: ProgressRingProps) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" />
      {p > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ * p} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
});
