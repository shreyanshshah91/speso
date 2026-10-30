import { addDays, addMonths, format, parseISO } from 'date-fns';
import { CalendarDays, Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateSheet } from '@/components/date-sheet';
import { GradientButton } from '@/components/ui/gradient-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { useMoney } from '@/hooks/ledger';
import { useOnOpen } from '@/hooks/use-on-open';
import { toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { MAX_SPREAD_DAYS, MAX_SPREAD_MONTHS, isValidSpreadRange, rangeShares } from '@/lib/spread';
import { C } from '@/theme';

const QUICK = [1, 2, 3, 4, 6, 12];

/** How an entry is spread: `months` equal shares, or the exact `from`–`to` range when both are set. */
export interface SpreadValue {
  months: number;
  from: string | null;
  to: string | null;
}

type Mode = 'months' | 'dates';

interface Props {
  visible: boolean;
  onClose: () => void;
  value: SpreadValue;
  onChange: (value: SpreadValue) => void;
  /** Entry amount and currency, for the preview. */
  amount: number;
  currency: string;
  /** Entry date (yyyy-MM-dd): month spreads start here, and a new range defaults to start here. */
  date: string;
}

/**
 * Spreads an entry over several months in reports — either equal shares over N months, or an
 * exact date range (e.g. a per diem for 27 Aug – 22 Nov) split by the days in each month.
 */
export function SpreadSheet({ visible, onClose, value, onChange, amount, currency, date }: Props) {
  const money = useMoney();
  const defaultRange = () => ({ from: date, to: toISODate(addDays(addMonths(parseISO(date), 3), -1)) });
  const [mode, setMode] = useState<Mode>(value.from && value.to ? 'dates' : 'months');
  const [months, setMonths] = useState(value.months);
  const [range, setRange] = useState(() => (value.from && value.to ? { from: value.from, to: value.to } : defaultRange()));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  useOnOpen(visible, () => {
    setMode(value.from && value.to ? 'dates' : 'months');
    setMonths(value.months);
    setRange(value.from && value.to ? { from: value.from, to: value.to } : defaultRange());
    setPicking(null);
  });

  const step = (d: number) => {
    const next = Math.min(MAX_SPREAD_MONTHS, Math.max(1, months + d));
    if (next !== months) haptic.select();
    setMonths(next);
  };

  const rangeOk = isValidSpreadRange(range.from, range.to);
  const shares = rangeOk ? rangeShares(amount > 0 ? amount : 0, range.from, range.to) : [];
  const totalDays = shares.reduce((a, s) => a + (s.days ?? 0), 0);

  const start = parseISO(date);
  const monthRange = months > 1 ? `${format(start, 'MMM yyyy')} – ${format(addMonths(start, months - 1), 'MMM yyyy')}` : format(start, 'MMMM yyyy');

  const done = () => {
    if (mode === 'dates') {
      if (!rangeOk) return;
      onChange({ months: Math.max(1, shares.length), from: range.from, to: range.to });
    } else {
      onChange({ months, from: null, to: null });
    }
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Spread">
      <View style={{ alignItems: 'center' }}>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'months', label: 'Months' },
            { value: 'dates', label: 'Dates' },
          ]}
        />
      </View>
      <T variant="small" tone="secondary" center style={styles.help}>
        {mode === 'months'
          ? 'Counts this in equal parts across several months. Your account balance still gets the full amount on the day.'
          : 'Counts this across the days it covers, e.g. a per diem for 27 Aug – 22 Nov. Each month gets the share for its days.'}
      </T>

      {mode === 'months' ? (
        <>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => step(-1)}
              disabled={months <= 1}
              style={[styles.round, months <= 1 && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="One month fewer">
              <Minus size={22} color="#fff" />
            </Pressable>
            <View style={styles.count} accessibilityLiveRegion="polite">
              <T variant="title" center>
                {months}
              </T>
              <T variant="small" tone="secondary" center>
                {months === 1 ? 'month (not spread)' : 'months'}
              </T>
            </View>
            <Pressable
              onPress={() => step(1)}
              disabled={months >= MAX_SPREAD_MONTHS}
              style={[styles.round, months >= MAX_SPREAD_MONTHS && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="One month more">
              <Plus size={22} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.quick}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  haptic.select();
                  setMonths(q);
                }}
                style={[styles.chip, q === months && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: q === months }}>
                <T variant="small">{q === 1 ? 'Off' : `${q}`}</T>
              </Pressable>
            ))}
          </View>
          <View style={styles.preview}>
            <T variant="body" center>
              {months > 1 && amount > 0 ? `${money(amount / months, currency)} a month` : amount > 0 ? money(amount, currency) : 'Enter an amount to see the split'}
            </T>
            <T variant="small" tone="secondary" center style={{ marginTop: 2 }}>
              {monthRange}
            </T>
          </View>
        </>
      ) : (
        <>
          <View style={styles.dates}>
            <DateField label="From" value={range.from} onPress={() => setPicking('from')} />
            <DateField label="To" value={range.to} onPress={() => setPicking('to')} />
          </View>
          {rangeOk ? (
            <View style={styles.breakdown}>
              <T variant="small" tone="secondary" style={styles.breakdownHead}>
                {totalDays} days over {shares.length} {shares.length === 1 ? 'month' : 'months'}
              </T>
              <ScrollView style={{ maxHeight: 176 }} showsVerticalScrollIndicator={false}>
                {shares.map((sh) => (
                  <View key={sh.date} style={styles.shareRow}>
                    <T variant="body" style={{ flex: 1 }}>
                      {format(parseISO(sh.date), 'MMM yyyy')}
                    </T>
                    <T variant="small" tone="secondary" style={{ marginRight: 12 }}>
                      {sh.days} {sh.days === 1 ? 'day' : 'days'}
                    </T>
                    <T variant="body">{amount > 0 ? money(sh.amount, currency) : '—'}</T>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <T variant="small" tone="red" center style={styles.error}>
              {range.to < range.from ? 'The end date must be on or after the start date.' : `Choose a range of up to ${Math.floor(MAX_SPREAD_DAYS / 365)} years.`}
            </T>
          )}
        </>
      )}

      <GradientButton label="Done" variant="light" height={52} onPress={done} disabled={mode === 'dates' && !rangeOk} />

      <DateSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        value={picking === 'to' ? range.to : range.from}
        allowFuture
        onChange={(d) => setRange((r) => (picking === 'to' ? { ...r, to: d } : { ...r, from: d }))}
      />
    </Sheet>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.dateField} accessibilityRole="button" accessibilityLabel={`${label}: ${format(parseISO(value), 'd MMMM yyyy')}`}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <View style={styles.dateValue}>
        <CalendarDays size={17} color={C.text2} />
        <T variant="body" numberOfLines={1}>
          {format(parseISO(value), 'd MMM yyyy')}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  help: { marginTop: 12, paddingHorizontal: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 14 },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.09)', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  count: { minWidth: 120, alignItems: 'center' },
  quick: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  chip: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: C.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipOn: { borderColor: '#FFFFFF' },
  preview: { marginTop: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)' },
  dates: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dateField: { flex: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)' },
  dateValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdown: { marginTop: 14, marginBottom: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14, paddingVertical: 10 },
  breakdownHead: { marginBottom: 4 },
  shareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  error: { marginTop: 16, marginBottom: 16 },
});
