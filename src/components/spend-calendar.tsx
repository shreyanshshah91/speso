import { eachDayOfInterval, getISODay, parseISO } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui/text';
import { compactNumber, toISODate } from '@/lib/format';

interface Props {
  from: string;
  to: string;
  /** Home-currency spend per ISO date. */
  byDay: Map<string, number>;
  /** Home-currency income per ISO date. */
  incomeByDay?: Map<string, number>;
  weekStartDay: number;
  hidden?: boolean;
  onPressDay?: (isoDate: string) => void;
}

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Colours sampled from the reference: a muted mid-tone cell with a lighter inner glow. Spend days
// are blue; income-only days use a green of the same depth.
const TONES = {
  spend: {
    cell: '#2B6799',
    day: '#7DADD9',
    side: ['rgba(118,172,224,0.38)', 'rgba(118,172,224,0)'] as const,
    top: ['rgba(118,172,224,0.3)', 'rgba(118,172,224,0)'] as const,
    base: ['rgba(125,182,238,0)', 'rgba(125,182,238,0.5)'] as const,
  },
  income: {
    cell: '#23704D',
    day: '#86D3AB',
    side: ['rgba(112,214,160,0.36)', 'rgba(112,214,160,0)'] as const,
    top: ['rgba(112,214,160,0.28)', 'rgba(112,214,160,0)'] as const,
    base: ['rgba(120,226,170,0)', 'rgba(120,226,170,0.45)'] as const,
  },
};
const INCOME_TEXT = '#9AF0C0';

interface Cell {
  key: string;
  day: number;
  spend: number;
  income: number;
}

/**
 * Month grid of daily totals. Spend days glow blue with the amount spent; income-only days glow
 * green with the amount earned; a day with both shows its income as a green line under the spend.
 */
export const SpendCalendar = memo(function SpendCalendar({ from, to, byDay, incomeByDay, weekStartDay, hidden, onPressDay }: Props) {
  const { cells, header } = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    const lead = (getISODay(days[0]) - weekStartDay + 7) % 7;
    const out: (null | Cell)[] = Array.from({ length: lead }, () => null);
    for (const d of days) {
      const key = toISODate(d);
      out.push({ key, day: d.getDate(), spend: byDay.get(key) ?? 0, income: incomeByDay?.get(key) ?? 0 });
    }
    while (out.length % 7 !== 0) out.push(null);
    const hdr = Array.from({ length: 7 }, (_, i) => WEEKDAY[(weekStartDay - 1 + i) % 7]);
    return { cells: out, header: hdr };
  }, [from, to, byDay, incomeByDay, weekStartDay]);

  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const amount = (v: number) => (hidden ? '•' : compactNumber(Math.round(v)));

  return (
    <View style={{ gap: 5 }}>
      <View style={styles.row}>
        {header.map((h, i) => (
          <View key={i} style={styles.head}>
            <T variant="body" tone="secondary" maxFontSizeMultiplier={1.1}>
              {h}
            </T>
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.row}>
          {r.map((c, ci) => {
            if (!c) return <View key={`e${ri}-${ci}`} style={styles.cellWrap} />;
            const tone = c.spend > 0 ? TONES.spend : c.income > 0 ? TONES.income : null;
            const both = c.spend > 0 && c.income > 0;
            const label = [`Day ${c.day}`, c.spend > 0 ? `spent ${Math.round(c.spend)}` : null, c.income > 0 ? `income ${Math.round(c.income)}` : null]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={c.key}
                style={({ pressed }) => [styles.cellWrap, pressed && { opacity: 0.7 }]}
                onPress={() => onPressDay?.(c.key)}
                accessibilityRole="button"
                accessibilityLabel={label}>
                {/* Keyed by tone: Android loses rounded corners when a background colour changes
                    after mount, so a day that gains its first entry gets a fresh cell. */}
                <View key={tone === TONES.spend ? 's' : tone ? 'i' : 'n'} style={[styles.cell, tone && { backgroundColor: tone.cell }]}>
                  {/* Soft inner glow like the reference: light along the sides, pooling at the base.
                      Drawn before the numbers so it sits beneath them (no zIndex on Android). */}
                  {tone ? (
                    <>
                      <LinearGradient colors={tone.side} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.glowLeft} pointerEvents="none" />
                      <LinearGradient colors={tone.side} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={styles.glowRight} pointerEvents="none" />
                      <LinearGradient colors={tone.top} style={styles.glowTop} pointerEvents="none" />
                      <LinearGradient colors={tone.base} style={styles.glowBase} pointerEvents="none" />
                    </>
                  ) : null}
                  <View style={styles.cellText}>
                    <T
                      variant="body"
                      tone="secondary"
                      style={[both ? styles.dayCompact : styles.day, tone && { color: tone.day }]}
                      maxFontSizeMultiplier={1.1}>
                      {c.day}
                    </T>
                    <T
                      variant="body"
                      tone={tone ? 'primary' : 'secondary'}
                      style={both ? styles.valueCompact : styles.value}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      maxFontSizeMultiplier={1.1}>
                      {c.spend > 0 ? amount(c.spend) : c.income > 0 ? `+${amount(c.income)}` : '0'}
                    </T>
                    {both ? (
                      <T
                        variant="body"
                        style={styles.incomeLine}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        maxFontSizeMultiplier={1.1}>
                        +{amount(c.income)}
                      </T>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface MonthProps {
  year: number;
  /** Home-currency totals per "yyyy-MM". */
  byMonth: Map<string, { income: number; expense: number }>;
  /** "yyyy-MM" of the current month, ringed in white. */
  currentKey?: string;
  hidden?: boolean;
  onPressMonth?: (month: string) => void;
}

/**
 * The year as a 3 x 4 grid of months (Quarterly and Yearly views), as in the reference. Months
 * read like the day cells: spend glows blue with the amount spent, income-only months glow green
 * with the amount earned, and a month with both shows its income as a green line under the spend.
 */
export const MonthCalendar = memo(function MonthCalendar({ year, byMonth, currentKey, hidden, onPressMonth }: MonthProps) {
  const amount = (v: number) => (hidden ? '•' : compactNumber(Math.round(v)));
  const rows = [0, 3, 6, 9].map((start) => [start, start + 1, start + 2]);
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r[0]} style={styles.monthRow}>
          {r.map((m) => {
            const key = `${year}-${String(m + 1).padStart(2, '0')}`;
            const spend = byMonth.get(key)?.expense ?? 0;
            const income = byMonth.get(key)?.income ?? 0;
            const tone = spend > 0 ? TONES.spend : income > 0 ? TONES.income : null;
            const both = spend > 0 && income > 0;
            const label = [MONTHS[m], spend > 0 ? `spent ${Math.round(spend)}` : null, income > 0 ? `income ${Math.round(income)}` : null]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                // Keyed by tone too (see the day cells): a fresh view when the colour changes.
                key={`${key}-${tone === TONES.spend ? 's' : tone ? 'i' : 'n'}`}
                onPress={() => onPressMonth?.(key)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={({ pressed }) => [styles.month, tone && { backgroundColor: tone.cell }, key === currentKey && styles.monthCurrent, pressed && { opacity: 0.7 }]}>
                {tone ? (
                  <>
                    <LinearGradient colors={tone.side} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.glowLeftMonth} pointerEvents="none" />
                    <LinearGradient colors={tone.side} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={styles.glowRightMonth} pointerEvents="none" />
                    <LinearGradient colors={tone.top} style={styles.glowTop} pointerEvents="none" />
                    <LinearGradient colors={tone.base} style={styles.glowBase} pointerEvents="none" />
                  </>
                ) : null}
                <T
                  variant="body"
                  tone="secondary"
                  style={[both ? styles.monthNameCompact : styles.monthName, tone && { color: tone.day }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  maxFontSizeMultiplier={1.1}>
                  {MONTHS[m]}
                </T>
                <T
                  variant="body"
                  tone={tone ? 'primary' : 'secondary'}
                  style={both ? styles.monthValueCompact : styles.monthValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  maxFontSizeMultiplier={1.1}>
                  {spend > 0 ? amount(spend) : income > 0 ? `+${amount(income)}` : '0'}
                </T>
                {both ? (
                  <T variant="body" style={styles.monthIncome} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.1}>
                    +{amount(income)}
                  </T>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', gap: 8 },
  month: {
    flex: 1,
    height: 72,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  monthCurrent: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  monthName: { fontSize: 16, lineHeight: 20 },
  monthValue: { fontSize: 16, lineHeight: 20 },
  // A month with spend and income stacks three lines, so each is a touch smaller.
  monthNameCompact: { fontSize: 14, lineHeight: 17, marginBottom: -3 },
  monthValueCompact: { fontSize: 15, lineHeight: 18, marginBottom: -3 },
  monthIncome: { fontSize: 13, lineHeight: 16, color: INCOME_TEXT },
  glowLeftMonth: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '6%' },
  glowRightMonth: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '6%' },
  row: { flexDirection: 'row', gap: 5 },
  head: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  cellWrap: { flex: 1, aspectRatio: 0.86, borderRadius: 8 },
  cell: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellText: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', paddingHorizontal: 2 },
  day: { fontSize: 14, lineHeight: 18 },
  value: { fontSize: 15, lineHeight: 19 },
  // A day with spend and income stacks three lines, so each is a touch smaller.
  dayCompact: { fontSize: 12, lineHeight: 15 },
  valueCompact: { fontSize: 13.5, lineHeight: 16 },
  incomeLine: { fontSize: 11, lineHeight: 13, color: INCOME_TEXT },
  // Narrow rims, as measured on the reference: ~9% of the width per side, a thin top edge and
  // light pooling in the bottom quarter.
  glowLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '10%' },
  glowRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '10%' },
  glowTop: { position: 'absolute', left: 0, right: 0, top: 0, height: '7%' },
  glowBase: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '26%' },
});
