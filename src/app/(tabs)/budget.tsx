import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { LayoutGrid, List, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ProgressRing } from '@/components/donut';
import { AddFab } from '@/components/fab';
import { TopBar } from '@/components/top-bar';
import { Card, Divider } from '@/components/ui/card';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { useBudgetStatus } from '@/hooks/budget';
import { useMoney } from '@/hooks/ledger';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { C, R } from '@/theme';

export default function BudgetScreen() {
  const { contentPadding: tabSpace } = useTabBarInsets();
  const router = useRouter();
  const money = useMoney();
  const { width } = useWindowDimensions();
  const status = useBudgetStatus();
  const [mode, setMode] = useState<'grid' | 'list'>('grid');

  if (!status.hasAny) {
    return (
      <Screen tint="teal">
        <TopBar />
        <ScrollView contentContainerStyle={[styles.emptyWrap, { paddingBottom: tabSpace }]} showsVerticalScrollIndicator={false}>
          <BudgetIllustration size={Math.min(width - 100, 290)} />
          <T variant="title" center style={{ marginTop: 28 }}>
            Budgeting
          </T>
          <T variant="body" tone="secondary" center style={styles.emptyText}>
            Set limits to how much you want to spend on each category
          </T>
          <View style={{ alignSelf: 'stretch', marginTop: 28 }}>
            <GradientButton label="Create budget" onPress={() => router.push('/budget-edit')} />
          </View>
        </ScrollView>
        <AddFab />
      </Screen>
    );
  }

  const over = status.totalLeft < 0;
  const ringSize = Math.min(width - 130, 260);
  const tileW = (width - 32 - 12) / 2;

  return (
    <Screen>
      <TopBar
        right={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <IconButton accessibilityLabel={mode === 'grid' ? 'Show as list' : 'Show as grid'} onPress={() => setMode(mode === 'grid' ? 'list' : 'grid')}>
              {mode === 'grid' ? <List size={22} color="#fff" /> : <LayoutGrid size={22} color="#fff" />}
            </IconButton>
            <IconButton accessibilityLabel="Edit budget" onPress={() => router.push('/budget-edit')}>
              <Pencil size={20} color="#fff" />
            </IconButton>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
        <View style={[styles.ringWrap, { height: ringSize + 20 }]}>
          <ProgressRing
            size={ringSize}
            thickness={18}
            progress={status.totalLimit > 0 ? Math.max(0, status.totalLeft) / status.totalLimit : 0}
            color={over ? C.red : '#FFFFFF'}
            trackColor="rgba(255,255,255,0.14)"
          />
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <T variant="bodyMedium" tone="secondary">
              {over ? 'Over budget' : 'Left this month'}
            </T>
            <T variant="hero" style={{ fontSize: 34, lineHeight: 42, maxWidth: ringSize - 60 }} adjustsFontSizeToFit numberOfLines={1}>
              {money(Math.abs(status.totalLeft))}
            </T>
            <T variant="small" style={{ color: over ? C.red : C.green }}>
              {money(status.totalSpent)} / {money(status.totalLimit)}
            </T>
          </View>
        </View>

        {status.items.length === 0 ? (
          <T variant="small" tone="secondary" center style={{ marginTop: 20, paddingHorizontal: 32 }}>
            Add category limits with the pencil button to track each category.
          </T>
        ) : mode === 'grid' ? (
          <View style={styles.grid}>
            {status.items.map((b) => {
              const bad = b.left < 0;
              return (
                <View key={b.budgetId} style={[styles.tile, { width: tileW }]}>
                  <View style={styles.tileRing}>
                    <ProgressRing size={58} thickness={6} progress={b.limit > 0 ? Math.max(0, b.left) / b.limit : 0} color={bad ? C.red : b.color} />
                    <View style={[StyleSheet.absoluteFill, styles.center]}>
                      <T style={{ fontSize: 22 }}>{b.icon}</T>
                    </View>
                  </View>
                  <T variant="heading" style={{ marginTop: 10, color: bad ? C.red : C.text }} numberOfLines={1} adjustsFontSizeToFit>
                    {money(Math.abs(b.left))}
                  </T>
                  <T variant="small" tone="secondary" numberOfLines={1}>
                    {b.name} {bad ? 'over' : 'left'}
                  </T>
                </View>
              );
            })}
          </View>
        ) : (
          <Card style={{ marginHorizontal: 16, marginTop: 10 }}>
            {status.items.map((b, i) => {
              const bad = b.left < 0;
              const pct = b.limit > 0 ? Math.min(1, b.spent / b.limit) : 1;
              return (
                <View key={b.budgetId}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable style={styles.listRow} onPress={() => router.push('/budget-edit')}>
                    <T style={{ fontSize: 22 }}>{b.icon}</T>
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={styles.listTop}>
                        <T variant="body">{b.name}</T>
                        <T variant="body" style={{ color: bad ? C.red : C.text }}>
                          {money(Math.abs(b.left))} {bad ? 'over' : 'left'}
                        </T>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: bad ? C.red : b.color }]} />
                      </View>
                      <T variant="caption" tone="secondary">
                        {money(b.spent)} of {money(b.limit)}
                      </T>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <AddFab />
    </Screen>
  );
}

/** Empty-state artwork: a glowing disc behind a stylised budget card. */
function BudgetIllustration({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient
        colors={['rgba(20,196,162,0.55)', 'rgba(7,96,111,0.25)']}
        style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: 'rgba(39,211,176,0.6)' }}
      />
      <View style={[styles.mockCard, { width: size * 0.66, paddingVertical: size * 0.08 }]}>
        <View>
          <ProgressRing size={size * 0.42} thickness={size * 0.045} progress={0.76} color="#FFFFFF" trackColor="rgba(255,255,255,0.18)" />
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <T variant="caption" tone="secondary">
              Left
            </T>
            <T variant="heading">76%</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: size * 0.06 }}>
          {[
            ['🍽️', 0.7, '#11B7FD'],
            ['🚗', 0.45, '#F49763'],
          ].map(([icon, p, color]) => (
            <View key={icon as string} style={styles.mockTile}>
              <ProgressRing size={size * 0.14} thickness={4} progress={p as number} color={color as string} />
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <T style={{ fontSize: size * 0.05 }}>{icon}</T>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40 },
  emptyText: { marginTop: 8, fontSize: 18, lineHeight: 24 },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  center: { alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginTop: 20 },
  tile: { backgroundColor: C.card, borderRadius: R.xl, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 10 },
  tileRing: { width: 58, height: 58 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  listTop: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  mockCard: { backgroundColor: '#232A2E', borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  mockTile: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 8 },
});
