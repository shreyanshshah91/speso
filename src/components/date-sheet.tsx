import { addMonths, eachDayOfInterval, endOfMonth, format, getISODay, isAfter, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { useOnOpen } from '@/hooks/use-on-open';
import { toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePrefs } from '@/store/prefs';
import { C } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Selected ISO date (yyyy-MM-dd). */
  value: string;
  onChange: (isoDate: string) => void;
  /** Allow picking days after today (default false: future days are dimmed). */
  allowFuture?: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month-grid date picker used across the app (transaction date, custom period From / To). */
export function DateSheet({ visible, onClose, value, onChange, allowFuture = false }: Props) {
  const weekStartDay = usePrefs((s) => s.weekStartDay);
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value)));
  const [picking, setPicking] = useState(false);

  useOnOpen(visible, () => {
    setMonth(startOfMonth(parseISO(value)));
    setPicking(false);
  });

  const today = startOfDay(new Date());
  const thisMonth = startOfMonth(today);
  const canGoNext = allowFuture || isAfter(thisMonth, month);

  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) });
  const lead = (getISODay(month) - weekStartDay + 7) % 7;
  const cells: (Date | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStartDay - 1 + i) % 7]);

  const pick = (d: Date) => {
    haptic.select();
    onChange(toISODate(d));
    onClose();
  };

  const years = Array.from({ length: 8 }, (_, i) => today.getFullYear() - i);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Pressable
          style={styles.titleBtn}
          onPress={() => setPicking((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={`${format(month, 'MMMM yyyy')}, choose month`}>
          <T variant="heading" style={{ fontSize: 20 }}>
            {format(month, 'MMMM yyyy')}
          </T>
          <View style={styles.round}>{picking ? <ChevronDown size={20} color="#fff" /> : <ChevronRight size={20} color="#fff" />}</View>
        </Pressable>
        {!picking ? (
          <View style={styles.nav}>
            <Pressable style={styles.round} onPress={() => setMonth((m) => addMonths(m, -1))} accessibilityLabel="Previous month" hitSlop={6}>
              <ChevronLeft size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={[styles.round, !canGoNext && { opacity: 0.35 }]}
              disabled={!canGoNext}
              onPress={() => setMonth((m) => addMonths(m, 1))}
              accessibilityLabel="Next month"
              hitSlop={6}>
              <ChevronRight size={20} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {picking ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
            {years.map((y) => {
              const on = y === month.getFullYear();
              return (
                <Pressable key={y} onPress={() => setMonth(new Date(y, month.getMonth(), 1))} style={[styles.yearPill, on && styles.selectedRing]}>
                  <T variant="body">{y}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.monthGrid}>
            {MONTHS.map((label, i) => {
              const candidate = new Date(month.getFullYear(), i, 1);
              const disabled = !allowFuture && isAfter(candidate, thisMonth);
              const on = i === month.getMonth();
              return (
                <Pressable
                  key={label}
                  disabled={disabled}
                  onPress={() => {
                    setMonth(candidate);
                    setPicking(false);
                  }}
                  style={[styles.monthCell, on && styles.selectedRing, disabled && { opacity: 0.35 }]}>
                  <T variant="body">{label}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View>
          <View style={styles.row}>
            {weekdays.map((w) => (
              <View key={w} style={styles.cell}>
                <T variant="body" tone="tertiary">
                  {w}
                </T>
              </View>
            ))}
          </View>
          {rows.map((r, ri) => (
            <View key={ri} style={styles.row}>
              {r.map((d, ci) => {
                if (!d) return <View key={`e${ci}`} style={styles.cell} />;
                const iso = toISODate(d);
                const selected = iso === value;
                const future = !allowFuture && isAfter(d, today);
                return (
                  <View key={iso} style={styles.cell}>
                    <Pressable
                      disabled={future}
                      onPress={() => pick(d)}
                      style={[styles.day, selected && styles.daySelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: future }}
                      accessibilityLabel={format(d, 'EEEE d MMMM yyyy')}>
                      <T variant="body" style={[styles.dayText, selected && { color: '#111416' }, future && { color: C.text3 }]}>
                        {d.getDate()}
                      </T>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingLeft: 4 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nav: { flexDirection: 'row', gap: 12 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48 },
  day: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: '#FFFFFF' },
  dayText: { fontSize: 17 },
  years: { gap: 8, paddingBottom: 14 },
  yearPill: { height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  monthCell: {
    width: '31.4%',
    height: 50,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectedRing: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.04)' },
});
