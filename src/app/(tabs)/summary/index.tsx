import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { Donut } from '@/components/donut';
import { Empty } from '@/components/empty';
import { AddFab } from '@/components/fab';
import { FilterBar } from '@/components/filter-bar';
import { PeriodHeader } from '@/components/period-header';
import { SwipePeriod } from '@/components/swipe-period';
import { TopBar } from '@/components/top-bar';
import { Card, Divider } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { filterTransactions, percentChange, sumHome, useConvert, useMoney, usePeriod } from '@/hooks/ledger';
import { groupByCategory } from '@/lib/stats';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { useData } from '@/store/data';
import { filterActions, useFilters } from '@/store/prefs';
import { C } from '@/theme';

const SCOPE = 'summary';

export default function SummaryScreen() {
  const { contentPadding: tabSpace } = useTabBarInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const money = useMoney();
  const convert = useConvert();
  const f = useFilters(SCOPE);
  const period = usePeriod(SCOPE);
  const allTx = useData((s) => s.ledger);
  const type = f.type === 'income' ? 'income' : 'expense';

  const txs = useMemo(
    () => filterTransactions(allTx, { from: period.from, to: period.to, type, accountId: f.accountId, categoryIds: f.categoryIds }),
    [allTx, period.from, period.to, type, f.accountId, f.categoryIds]
  );
  const total = useMemo(() => sumHome(txs, convert), [txs, convert]);
  const prevTotal = useMemo(
    () =>
      period.previous
        ? sumHome(
            filterTransactions(allTx, { from: period.previous.from, to: period.previous.to, type, accountId: f.accountId, categoryIds: f.categoryIds }),
            convert
          )
        : 0,
    [allTx, period.previous, type, f.accountId, f.categoryIds, convert]
  );

  const groups = useMemo(() => {
    const g = groupByCategory(txs, convert, type);
    const counts = new Map<number, number>();
    for (const t of txs) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    return g.map((x) => ({ ...x, count: counts.get(x.categoryId) ?? 0 }));
  }, [txs, convert, type]);

  const segments = useMemo(() => groups.map((g) => ({ key: g.categoryId, value: g.total, color: g.color })), [groups]);

  // Replay the ring's spin-in every time the Summary tab comes into view.
  const [spinKey, setSpinKey] = useState(0);
  useFocusEffect(useCallback(() => setSpinKey((k) => k + 1), []));
  const ringSize = Math.min(width - 80, 360);

  const openCategory = (categoryId: number) => {
    // The category page starts on the same period and account as Summary.
    filterActions('category').set({
      period: f.period,
      offset: f.offset,
      customFrom: f.customFrom,
      customTo: f.customTo,
      accountId: f.accountId,
      sort: 'date_desc',
    });
    router.push(`/summary/${categoryId}`);
  };

  return (
    <Screen>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
        <SwipePeriod scope={SCOPE}>
          <View style={[styles.ringWrap, { height: ringSize + 16 }]}>
            <Donut size={ringSize} thickness={Math.round(ringSize * 0.064)} segments={segments} gap={8} corner={5} animateKey={spinKey} />
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={styles.ringCenter} pointerEvents="box-none">
                <PeriodHeader scope={SCOPE} period={period} amountText={money(total)} change={percentChange(total, prevTotal)} upIsGood={type === 'income'} />
              </View>
            </View>
          </View>
        </SwipePeriod>

        <View style={{ marginTop: 22 }}>
          <FilterBar scope={SCOPE} typeMode="summary" />
        </View>

        <Card style={styles.list}>
          {groups.length === 0 ? (
            <Empty emoji={type === 'expense' ? '🧾' : '💰'} title={`No ${type === 'expense' ? 'expenses' : 'income'} yet`} message="Tap + to add your first one." />
          ) : (
            groups.map((g, i) => (
              <View key={g.categoryId}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name}, ${money(g.total)}, ${g.percent.toFixed(1)} percent`}
                  onPress={() => openCategory(g.categoryId)}>
                  <CategoryIcon icon={g.icon} color={g.color} outlined size={40} />
                  <View style={styles.nameWrap}>
                    <T variant="body" numberOfLines={1} style={{ flexShrink: 1, fontSize: 17 }}>
                      {g.name}
                    </T>
                    <View style={styles.count}>
                      <T variant="small" tone="secondary">
                        {g.count}
                      </T>
                    </View>
                  </View>
                  <T variant="body" style={{ fontSize: 17 }}>
                    {money(g.total)}
                  </T>
                  <View style={styles.pct}>
                    <T variant="caption" tone="secondary" style={{ fontSize: 14 }}>
                      {g.percent.toFixed(2)}%
                    </T>
                  </View>
                </Pressable>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
      <AddFab />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { marginHorizontal: 16, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, height: 57 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 },
  count: { backgroundColor: C.badge, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  pct: { backgroundColor: C.badge, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, minWidth: 54, alignItems: 'center' },
});
