import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { PeriodSheet } from '@/components/period-sheet';
import { SelectDateSheet } from '@/components/select-date-sheet';
import { T } from '@/components/ui/text';
import { isShiftable, type Period } from '@/lib/period';
import type { FilterScope } from '@/store/prefs';
import { C } from '@/theme';

interface Props {
  scope: FilterScope;
  period: Period;
  amountText: string;
  /** % change vs the previous period (null hides the line). */
  change: number | null;
  /** For income, going up is good (green); for expenses it is bad (red). */
  upIsGood?: boolean;
  /** Replaces the tappable period title with a plain label (e.g. a category name). */
  title?: string;
  /** A green line shown instead of the % change (e.g. "Income R 44 000" on All activity). */
  note?: string;
}

/** "This month ⌄ / R 1 132 / ↑ 19% from Aug". Tap the title to jump to another period. */
export function PeriodHeader({ scope, period, amountText, change, upIsGood, title, note }: Props) {
  const [open, setOpen] = useState<'date' | 'period' | null>(null);
  // Fits inside the Summary ring on narrow phones; the text shrinks to fit rather than clipping.
  const { width } = useWindowDimensions();
  const heroMax = Math.min(280, width * 0.62);
  const up = change !== null && change >= 0;
  const good = change !== null && (upIsGood ? up : !up);
  const color = good ? C.green : C.red;

  return (
    <View style={styles.wrap}>
      {title ? (
        <T variant="body" tone="secondary" style={{ fontSize: 17 }} numberOfLines={1}>
          {title}
        </T>
      ) : (
        <Pressable
          onPress={() => setOpen(isShiftable(period.kind) ? 'date' : 'period')}
          style={styles.titleRow}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${period.title}, change period`}>
          <T variant="body" tone="secondary" style={{ fontSize: 17 }}>
            {period.title}
          </T>
          <ChevronDown size={16} color={C.text2} />
        </Pressable>
      )}
      <T variant="hero" adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} style={[styles.hero, { maxWidth: heroMax }]} accessibilityRole="header">
        {amountText}
      </T>
      {note ? (
        <View style={styles.changeRow}>
          <T variant="body" tone="green" style={{ fontSize: 17 }} numberOfLines={1}>
            {note}
          </T>
        </View>
      ) : change !== null && period.previous ? (
        <View style={styles.changeRow}>
          <View style={[styles.arrow, { backgroundColor: color }]}>
            {up ? <ArrowUp size={10} color="#fff" strokeWidth={3} /> : <ArrowDown size={10} color="#fff" strokeWidth={3} />}
          </View>
          <T variant="body" style={{ color, fontSize: 17 }}>
            {Math.abs(change) >= 1000 ? '999+' : Math.abs(change).toFixed(0)}% from {period.previous.short}
          </T>
        </View>
      ) : (
        <View style={{ height: 22 }} />
      )}
      <SelectDateSheet visible={open === 'date'} onClose={() => setOpen(null)} scope={scope} />
      <PeriodSheet visible={open === 'period'} onClose={() => setOpen(null)} scope={scope} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { fontSize: 42, lineHeight: 50 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22 },
  arrow: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
