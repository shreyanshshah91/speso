import { useRouter } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { currencySymbol } from '@/lib/currencies';
import { CURRENCY_POSITIONS, NUMBER_FORMAT_IDS, formatNumber, joinFormat, splitFormat, type CurrencyPosition } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePrefs } from '@/store/prefs';
import { C } from '@/theme';

/** Number format (grouping + decimal mark) and currency direction, chosen separately. */
export default function CurrencyFormatScreen() {
  const router = useRouter();
  const fmt = usePrefs((s) => s.currencyFormat);
  const home = usePrefs((s) => s.homeCurrency);
  const set = usePrefs((s) => s.set);
  const { number, position } = splitFormat(fmt);
  const symbol = currencySymbol(home);
  const sample = formatNumber(1234.56, fmt, 2);

  const choose = (next: typeof fmt) => {
    haptic.select();
    set('currencyFormat', next);
  };

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} size={46}>
          <ChevronLeft size={24} color="#fff" />
        </IconButton>
        <T variant="heading" center style={styles.title}>
          Currency format
        </T>
        <View style={{ width: 46 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <T variant="body" tone="secondary" style={styles.section}>
          Number format
        </T>
        <View style={styles.card}>
          {NUMBER_FORMAT_IDS.map((n, i) => (
            <Option key={n} first={i === 0} selected={n === number} onPress={() => choose(joinFormat(n, position))} label={formatNumber(1234.56, joinFormat(n, position), 2)}>
              <T variant="body">{formatNumber(1234.56, joinFormat(n, position), 2)}</T>
            </Option>
          ))}
        </View>

        <T variant="body" tone="secondary" style={styles.section}>
          Currency direction
        </T>
        <View style={styles.card}>
          {CURRENCY_POSITIONS.map((p, i) => (
            <Option key={p} first={i === 0} selected={p === position} onPress={() => choose(joinFormat(number, p))} label={directionLabel(p, symbol, sample)}>
              {/* Symbol bright, number dimmed, so the position is what stands out. */}
              <T variant="body" style={{ color: C.text2 }}>
                {p === 'after' ? (
                  <>
                    {sample} <T variant="body">{symbol}</T>
                  </>
                ) : (
                  <>
                    <T variant="body">{symbol}</T>
                    {p === 'before_space' ? ' ' : ''}
                    {sample}
                  </>
                )}
              </T>
            </Option>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function directionLabel(p: CurrencyPosition, symbol: string, sample: string): string {
  return p === 'after' ? `${sample} ${symbol}` : p === 'before_space' ? `${symbol} ${sample}` : `${symbol}${sample}`;
}

function Option({ first, selected, onPress, label, children }: { first: boolean; selected: boolean; onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      <View style={styles.flex}>{children}</View>
      {selected ? (
        <View style={styles.check}>
          <Check size={14} color="#111416" strokeWidth={3.2} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  section: { marginTop: 22, marginBottom: 12, marginLeft: 2 },
  card: { borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
