import { format, getQuarter, parseISO } from 'date-fns';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/options-sheet';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { usePeriodComputer } from '@/hooks/ledger';
import { useOnOpen } from '@/hooks/use-on-open';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { filterActions, useFilters, type FilterScope } from '@/store/prefs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  visible: boolean;
  onClose: () => void;
  scope: FilterScope;
}

/** Jump straight to any month / quarter / year / week of the current period type. */
export function SelectDateSheet({ visible, onClose, scope }: Props) {
  const { period: kind, offset } = useFilters(scope);
  const { setOffset } = filterActions(scope);
  const compute = usePeriodComputer();
  const transactions = useData((s) => s.ledger);

  const current = compute(kind, 0);
  const selected = compute(kind, offset);
  const base = parseISO(current.from);
  const sel = parseISO(selected.from);
  const baseYear = base.getFullYear();
  const earliestYear = transactions.length ? Number(transactions[transactions.length - 1].date.slice(0, 4)) : baseYear;
  const firstYear = Math.min(earliestYear, baseYear - 4);
  const years = Array.from({ length: baseYear - firstYear + 1 }, (_, i) => baseYear - i);

  const [year, setYear] = useState(sel.getFullYear());
  useOnOpen(visible, () => setYear(kind === 'ytd' ? baseYear + offset : sel.getFullYear()));

  const choose = (o: number) => {
    haptic.select();
    setOffset(o);
    onClose();
  };

  const yearPills = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
      {years.map((y) => {
        const on = y === year;
        return (
          <Pressable
            key={y}
            onPress={() => (kind === 'ytd' ? choose(y - baseYear) : setYear(y))}
            style={[styles.yearPill, on && styles.selected]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}>
            <T variant="body">{y}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const grid = (labels: string[], toOffset: (i: number) => number, cols = 3) => (
    <View style={styles.grid}>
      {labels.map((label, i) => {
        const o = toOffset(i);
        const future = o > 0;
        const on = o === offset;
        return (
          <Pressable
            key={label}
            disabled={future}
            onPress={() => choose(o)}
            style={[styles.cell, { width: cols === 3 ? '31.4%' : '48.5%' }, on && styles.selected, future && styles.disabled]}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: future }}>
            <T variant="body" tone={future ? 'tertiary' : 'primary'}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );

  let body: React.ReactNode = null;
  if (kind === 'monthly') {
    const baseIndex = baseYear * 12 + base.getMonth();
    body = (
      <>
        {yearPills}
        {grid(MONTHS, (m) => year * 12 + m - baseIndex)}
      </>
    );
  } else if (kind === 'quarterly') {
    const baseIndex = baseYear * 4 + getQuarter(base) - 1;
    body = (
      <>
        {yearPills}
        {grid(['Q1', 'Q2', 'Q3', 'Q4'], (q) => year * 4 + q - baseIndex, 2)}
      </>
    );
  } else if (kind === 'ytd') {
    body = yearPills;
  } else if (kind === 'weekly') {
    body = (
      <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {Array.from({ length: 26 }, (_, i) => {
          const p = compute('weekly', -i);
          const label = i === 0 ? 'This week' : i === 1 ? 'Last week' : `${format(parseISO(p.from), 'd MMM')} – ${format(parseISO(p.to), 'd MMM yyyy')}`;
          return <ChoiceRow key={i} label={label} selected={-i === offset} onPress={() => choose(-i)} />;
        })}
      </ScrollView>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Select date">
      {body}
      <T variant="small" tone="tertiary" center style={{ marginTop: 18 }}>
        Tip: swipe left or right on the chart to change period
      </T>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  years: { gap: 8, paddingBottom: 14 },
  yearPill: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    height: 52,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selected: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.04)' },
  disabled: { opacity: 0.45 },
});

