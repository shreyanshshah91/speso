import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { useConvert, useMoney } from '@/hooks/ledger';
import { useData } from '@/store/data';
import { C, R } from '@/theme';

interface Props {
  /** ISO date to show, or null when closed. */
  date: string | null;
  /** "yyyy-MM" to show a whole month instead (the Quarterly and Yearly calendars). */
  month?: string | null;
  onClose: () => void;
  accountId: number | null;
}

/** Everything that happened on one day (or in one month): tapped from the Analytics calendar. */
export function DaySheet({ date, month = null, onClose, accountId }: Props) {
  const router = useRouter();
  const money = useMoney();
  const convert = useConvert();
  const transactions = useData((s) => s.ledger);

  const items = useMemo(() => {
    if (!date && !month) return [];
    const inRange = month ? (d: string) => d.startsWith(month) : (d: string) => d === date;
    return transactions.filter((t) => inRange(t.date) && (accountId === null || t.accountId === accountId));
  }, [transactions, date, month, accountId]);
  const total = items.reduce((s, t) => s + (t.type === 'income' ? 1 : -1) * convert(t.amount, t.currencyCode), 0);
  const income = items.reduce((s, t) => s + (t.type === 'income' ? convert(t.amount, t.currencyCode) : 0), 0);
  const expenses = items.reduce((s, t) => s + (t.type === 'income' ? 0 : convert(t.amount, t.currencyCode)), 0);
  const visible = date !== null || month !== null;

  const open = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as never), 200);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      tall
      headerLeft={
        <IconButton accessibilityLabel="Close" onPress={onClose} size={44}>
          <X size={22} color="#fff" strokeWidth={2.4} />
        </IconButton>
      }>
      {visible ? (
        <>
          <T variant="title" style={styles.title}>
            {month ? format(parseISO(`${month}-01`), 'MMMM yyyy') : format(parseISO(date!), 'EEEE, d MMM')}
          </T>
          {month ? (
            <>
              <View style={styles.totalRow}>
                <T variant="body" tone="secondary">
                  Income
                </T>
                <T variant="body" tone="green">
                  {money(income, undefined, { signed: income > 0 })}
                </T>
              </View>
              <View style={styles.totalRow}>
                <T variant="body" tone="secondary">
                  Expenses
                </T>
                <T variant="body">{money(expenses)}</T>
              </View>
            </>
          ) : null}
          <View style={styles.totalRow}>
            <T variant="body" tone="secondary">
              Total amount
            </T>
            <T variant="body">{money(total, undefined, { signed: total > 0 })}</T>
          </View>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <T variant="body" tone="secondary" center>
                {month ? 'No transactions in this month.' : 'No transactions on this day.'}
              </T>
              {date ? (
                <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
                  <GradientButton label="Add transaction" variant="light" height={50} onPress={() => open(`/transaction/new?date=${date}`)} />
                </View>
              ) : null}
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              <View style={styles.card}>
                {items.map((t, i) => (
                  <Pressable
                    key={t.part ? `${t.id}.${t.part.index}` : t.id}
                    onPress={() => open(`/transaction/${t.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.note || t.categoryName}, ${money(t.amount, t.currencyCode)}`}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                    <CategoryIcon icon={t.categoryIcon} size={37} />
                    <View style={{ flex: 1 }}>
                      <T variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
                        {t.note || t.categoryName}
                      </T>
                      {/* A month lists many days, so each row says which. */}
                      {month ? (
                        <T variant="caption" tone="secondary" numberOfLines={1}>
                          {format(parseISO(t.date), 'EEE d MMM')}
                        </T>
                      ) : null}
                    </View>
                    <T variant="body" tone={t.type === 'income' ? 'green' : 'primary'} style={{ fontSize: 16 }}>
                      {money(t.amount, t.currencyCode, { signed: t.type === 'income' })}
                    </T>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 4, marginBottom: 22 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
  card: { backgroundColor: C.card, borderRadius: R.xl, overflow: 'hidden', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 11, height: 57 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  empty: { paddingVertical: 28, alignItems: 'center' },
});
