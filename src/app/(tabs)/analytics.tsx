import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { Database, Percent, Repeat } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BarSwatch, IncomeExpenseBars, IncomeLeftBars, type Bucket } from '@/components/analytics-charts';
import { DaySheet } from '@/components/day-sheet';
import { AddFab } from '@/components/fab';
import { OptionsSheet } from '@/components/options-sheet';
import { MonthCalendar, SpendCalendar } from '@/components/spend-calendar';
import { SwipeSteps } from '@/components/swipe-period';
import { TopBar } from '@/components/top-bar';
import { Card, Divider } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { useBudgetStatus } from '@/hooks/budget';
import { filterTransactions, useConvert, useMoney } from '@/hooks/ledger';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { ANALYTICS_PERIODS, analyticsView, bucketTitle, isAnalyticsPeriod, pageTitle, type AnalyticsPeriod } from '@/lib/analytics';
import { useData } from '@/store/data';
import { filterActions, useFilters, usePrefs } from '@/store/prefs';
import { CHART_H, C, R } from '@/theme';

const SCOPE = 'analytics';
const FREQ_PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;

export default function AnalyticsScreen() {
  const { contentPadding: tabSpace } = useTabBarInsets();
  const router = useRouter();
  const money = useMoney();
  const convert = useConvert();
  const transactions = useData((s) => s.ledger);
  const categories = useData((s) => s.categories);
  const recurring = useData((s) => s.recurring);
  const accounts = useData((s) => s.accounts);
  const { period: rawPeriod, offset: page, accountId } = useFilters(SCOPE);
  const defaultPeriod = usePrefs((s) => s.defaultAnalyticsPeriod);
  const period: AnalyticsPeriod = isAnalyticsPeriod(rawPeriod) ? rawPeriod : defaultPeriod;
  const { setPeriod, setOffset, setAccountId } = filterActions(SCOPE);
  const weekStartDay = usePrefs((s) => s.weekStartDay);
  const monthStartDay = usePrefs((s) => s.monthStartDay);
  const [sheet, setSheet] = useState<'period' | 'account' | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const hidden = usePrefs((s) => s.hideBalances);
  const budget = useBudgetStatus();
  const [percent, setPercent] = useState(false);

  // One page of bars: a week of days, six months, a year of quarters or six years.
  const view = useMemo(() => analyticsView(period, page, { monthStartDay, weekStartDay }), [period, page, monthStartDay, weekStartDay]);
  const n = view.buckets.length;
  const todayIndex = view.current >= 0 ? view.current : n - 1;

  // The selected bar. When the page or period changes it resets to the bar the move asked for
  // (going back lands on the last bar, as in the reference) or to today's.
  const viewKey = `${period}:${page}`;
  const [sel, setSel] = useState({ key: viewKey, index: todayIndex });
  const [landing, setLanding] = useState<number | null>(null);
  let selected = sel.index;
  if (sel.key !== viewKey) {
    selected = landing === null ? todayIndex : Math.max(0, Math.min(n - 1, landing));
    setSel({ key: viewKey, index: selected });
    setLanding(null);
  }
  const selBucket = view.buckets[selected];

  const goToPage = (dir: 1 | -1, land: number | null) => {
    setLanding(land);
    setOffset(page + dir);
  };
  // Swiping the charts turns a whole page: back lands on its last bar, forward on its first (or
  // on today's, back on the current page).
  const turnPage = (dir: 1 | -1) => goToPage(dir, dir < 0 ? n - 1 : page + dir === 0 ? null : 0);
  const canTurnPage = (dir: 1 | -1) => dir < 0 || page < 0;

  // The calendar is the whole page for Weekly (that week) and Quarterly (that year); for Monthly
  // and Yearly it's the selected month or year, and swiping it steps one month or year.
  const calendarIsPage = period === 'weekly' || period === 'quarterly';
  const stepCalendar = (dir: 1 | -1) => {
    if (calendarIsPage) return turnPage(dir);
    const next = selected + dir;
    if (next < 0) return goToPage(-1, n - 1);
    if (next >= n) return goToPage(1, 0);
    setSel({ key: viewKey, index: next });
  };
  const canStepCalendar = (dir: 1 | -1) => (calendarIsPage ? canTurnPage(dir) : dir < 0 || page < 0 || selected < todayIndex);

  const buckets = useMemo<Bucket[]>(() => {
    const scoped = filterTransactions(transactions, { from: view.from, to: view.to, accountId });
    return view.buckets.map((b) => {
      let income = 0;
      let expense = 0;
      for (const t of scoped) {
        if (t.date < b.from || t.date > b.to) continue;
        const v = convert(t.amount, t.currencyCode);
        if (t.type === 'income') income += v;
        else expense += v;
      }
      return { key: b.key, label: b.label, income, expense, future: b.future };
    });
  }, [transactions, view, accountId, convert]);

  const sel2 = buckets[selected];
  const selTitle = bucketTitle(period, selBucket);

  // "Income left this week / month / quarter / year": the whole week for Weekly (the week is the
  // page), otherwise the selected bar's. It doesn't go below zero.
  const leftSource = (() => {
    if (period === 'weekly') {
      const income = buckets.reduce((a, b) => a + b.income, 0);
      const expense = buckets.reduce((a, b) => a + b.expense, 0);
      return { income, expense, title: page === 0 ? 'Income left this week' : `Income left · ${pageTitle(view)}` };
    }
    const title = selected === view.current ? `Income left this ${view.unit}` : `Income left · ${selTitle}`;
    return { income: sel2.income, expense: sel2.expense, title };
  })();
  const left = Math.max(0, leftSource.income - leftSource.expense);
  const leftPct = leftSource.income > 0 ? (left / leftSource.income) * 100 : null;

  // Calendar: days for Weekly (the week) and Monthly (the selected month), months otherwise.
  const calendar =
    period === 'weekly'
      ? ({ kind: 'days', from: view.from, to: view.to, title: pageTitle(view) } as const)
      : period === 'monthly'
        ? ({ kind: 'days', from: selBucket.from, to: selBucket.to, title: format(parseISO(selBucket.from), 'MMMM yyyy') } as const)
        : ({ kind: 'months', year: Number((period === 'quarterly' ? view.from : selBucket.from).slice(0, 4)) } as const);
  const calFrom = calendar.kind === 'days' ? calendar.from : `${calendar.year}-01-01`;
  const calTo = calendar.kind === 'days' ? calendar.to : `${calendar.year}-12-31`;

  // Daily and monthly totals for the calendar.
  const { byDay, incomeByDay, byMonth } = useMemo(() => {
    const spend = new Map<string, number>();
    const income = new Map<string, number>();
    const months = new Map<string, { income: number; expense: number }>();
    for (const t of filterTransactions(transactions, { from: calFrom, to: calTo, accountId })) {
      const v = convert(t.amount, t.currencyCode);
      const m = t.type === 'income' ? income : spend;
      m.set(t.date, (m.get(t.date) ?? 0) + v);
      const key = t.date.slice(0, 7);
      const mt = months.get(key) ?? { income: 0, expense: 0 };
      if (t.type === 'income') mt.income += v;
      else mt.expense += v;
      months.set(key, mt);
    }
    return { byDay: spend, incomeByDay: income, byMonth: months };
  }, [transactions, calFrom, calTo, accountId, convert]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeRecurring = useMemo(() => recurring.filter((r) => r.active && (accountId === null || r.accountId === accountId)), [recurring, accountId]);
  const recurringMonthly = useMemo(() => {
    let exp = 0;
    let inc = 0;
    for (const r of activeRecurring) {
      const v = convert(r.amount, r.currencyCode) * FREQ_PER_MONTH[r.frequency];
      if (r.type === 'income') inc += v;
      else exp += v;
    }
    return { exp, inc };
  }, [activeRecurring, convert]);

  const periodLabel = ANALYTICS_PERIODS.find((p) => p.value === period)?.label ?? 'Monthly';

  return (
    <Screen>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
        <View style={styles.pills}>
          {/* Like the reference: a pill that differs from its default gets a ring and an ⓧ. */}
          <Pill label={periodLabel} onPress={() => setSheet('period')} active={period !== defaultPeriod} onClear={() => setPeriod(defaultPeriod)} />
          <Pill
            label={accountId === null ? 'All accounts' : (accounts.find((a) => a.id === accountId)?.name ?? 'Account')}
            onPress={() => setSheet('account')}
            active={accountId !== null}
            onClear={() => setAccountId(null)}
          />
        </View>

        <Card style={styles.card}>
          <View style={styles.legendRow}>
            <Legend palette="green" label="Income" value={money(sel2.income)} />
            <Legend palette="blue" label="Expenses" value={money(sel2.expense)} />
            {/* The selected bar's period, with its year. */}
            <View style={styles.periodTag} accessibilityLabel={`Showing ${selTitle}`}>
              <T variant="small" tone="secondary" numberOfLines={1}>
                {selTitle}
              </T>
            </View>
          </View>
          <SwipeSteps onStep={turnPage} canStep={canTurnPage}>
            <IncomeExpenseBars buckets={buckets} selected={selected} onSelect={(i) => setSel({ key: viewKey, index: i })} height={CHART_H} hidden={hidden} />
          </SwipeSteps>
        </Card>

        <Card style={styles.card}>
          <View style={styles.leftHeader}>
            <View style={{ flex: 1 }}>
              <T variant="body" tone="secondary" style={{ fontSize: 17 }} numberOfLines={1}>
                {leftSource.title}
              </T>
              <T variant="heading" style={{ fontSize: 22, marginTop: 2 }}>
                {percent ? (leftPct === null ? '0%' : `${Math.round(leftPct)}%`) : money(left)}
              </T>
            </View>
            <View style={styles.toggle}>
              <Pressable
                accessibilityLabel="Show amounts"
                onPress={() => setPercent(false)}
                style={[styles.toggleBtn, !percent && styles.toggleOn]}>
                <Database size={19} color={percent ? C.text2 : '#fff'} />
              </Pressable>
              <Pressable accessibilityLabel="Show savings rate" onPress={() => setPercent(true)} style={[styles.toggleBtn, percent && styles.toggleOn]}>
                <Percent size={19} color={percent ? '#fff' : C.text2} />
              </Pressable>
            </View>
          </View>
          <SwipeSteps onStep={turnPage} canStep={canTurnPage}>
            <IncomeLeftBars buckets={buckets} selected={selected} onSelect={(i) => setSel({ key: viewKey, index: i })} height={CHART_H} percent={percent} hidden={hidden} />
          </SwipeSteps>
        </Card>

        <Card style={styles.card}>
          <T variant="body" tone="secondary" style={{ fontSize: 17, marginBottom: 12 }}>
            Calendar · {calendar.kind === 'days' ? calendar.title : calendar.year}
          </T>
          <SwipeSteps onStep={stepCalendar} canStep={canStepCalendar}>
            {calendar.kind === 'days' ? (
              <SpendCalendar from={calendar.from} to={calendar.to} byDay={byDay} incomeByDay={incomeByDay} weekStartDay={weekStartDay} hidden={hidden} onPressDay={setDay} />
            ) : (
              <MonthCalendar year={calendar.year} byMonth={byMonth} currentKey={format(new Date(), 'yyyy-MM')} hidden={hidden} onPressMonth={setMonth} />
            )}
          </SwipeSteps>
        </Card>

        <Card style={styles.card}>
          <View style={styles.insightHead}>
            <T variant="body" tone="secondary" style={{ fontSize: 17 }}>
              Recurring
            </T>
            <Pressable onPress={() => router.push('/settings/recurring')} hitSlop={8}>
              <T variant="small" tone="teal">
                Manage
              </T>
            </Pressable>
          </View>
          {activeRecurring.length === 0 ? (
            <View style={styles.insightEmpty}>
              <Repeat size={28} color={C.text2} />
              <T variant="small" tone="secondary" center style={{ marginTop: 8 }}>
                Mark a transaction as repeating with the ↻ button on the add screen to see your fixed costs here.
              </T>
            </View>
          ) : (
            <>
              <View style={styles.statRow}>
                <Stat label="Fixed costs / month" value={money(recurringMonthly.exp)} />
                <Stat label="Recurring income / month" value={money(recurringMonthly.inc)} tone="green" />
              </View>
              {activeRecurring.slice(0, 6).map((r, i) => {
                const c = catById.get(r.categoryId);
                return (
                  <View key={r.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.insightRow}>
                      <T style={{ fontSize: 22 }}>{c?.icon ?? '📦'}</T>
                      <View style={{ flex: 1 }}>
                        <T variant="body" numberOfLines={1}>
                          {r.note || c?.name || 'Recurring'}
                        </T>
                        <T variant="caption" tone="secondary">
                          {r.frequency[0].toUpperCase() + r.frequency.slice(1)} · next {format(parseISO(r.nextRunDate), 'd MMM')}
                        </T>
                      </View>
                      <T variant="body" tone={r.type === 'income' ? 'green' : 'primary'}>
                        {money(r.amount, r.currencyCode)}
                      </T>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.insightHead}>
            <T variant="body" tone="secondary" style={{ fontSize: 17 }}>
              Budgets this month
            </T>
            <Pressable onPress={() => router.push('/budget-edit')} hitSlop={8}>
              <T variant="small" tone="teal">
                {budget.hasAny ? 'Edit' : 'Create'}
              </T>
            </Pressable>
          </View>
          {!budget.hasAny ? (
            <T variant="small" tone="secondary" center style={{ paddingVertical: 20 }}>
              Set a budget to compare what you planned with what you spent.
            </T>
          ) : (
            <>
              <View style={styles.statRow}>
                <Stat label="Spent" value={money(budget.totalSpent)} />
                <Stat label={budget.totalLeft >= 0 ? 'Left' : 'Over'} value={money(Math.abs(budget.totalLeft))} tone={budget.totalLeft >= 0 ? 'green' : 'red'} />
              </View>
              {budget.items.map((b) => {
                const pct = b.limit > 0 ? b.spent / b.limit : 1;
                return (
                  <View key={b.budgetId} style={styles.budgetRow}>
                    <View style={styles.budgetTop}>
                      <T variant="small">
                        {b.icon} {b.name}
                      </T>
                      <T variant="small" tone={pct > 1 ? 'red' : 'secondary'}>
                        {Math.round(pct * 100)}%
                      </T>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.min(1, pct) * 100}%`, backgroundColor: pct > 1 ? C.red : b.color }]} />
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </Card>
      </ScrollView>
      <AddFab />
      <DaySheet
        date={day}
        month={month}
        onClose={() => {
          setDay(null);
          setMonth(null);
        }}
        accountId={accountId}
      />
      <OptionsSheet<AnalyticsPeriod>
        visible={sheet === 'period'}
        onClose={() => setSheet(null)}
        title="Time period"
        options={ANALYTICS_PERIODS}
        value={period}
        defaultValue={defaultPeriod}
        onMakeDefault={(v) => usePrefs.getState().set('defaultAnalyticsPeriod', v)}
        onSelect={setPeriod}
      />
      <OptionsSheet<number | null>
        visible={sheet === 'account'}
        onClose={() => setSheet(null)}
        title="Accounts"
        value={accountId}
        defaultValue={null}
        onSelect={setAccountId}
        options={[{ value: null, label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon }))]}
      />
    </Screen>
  );
}

function Legend({ palette, label, value }: { palette: 'green' | 'blue'; label: string; value: string }) {
  return (
    <View style={styles.legend}>
      {/* Chip styled exactly like the bars it labels. */}
      <BarSwatch palette={palette} />
      <T variant="body" tone="secondary" style={{ fontSize: 17 }}>
        {label}
      </T>
      <T variant="heading" style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </T>
    </View>
  );
}

function Stat({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'green' | 'red' }) {
  return (
    <View style={styles.stat}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <T variant="heading" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 4 },
  card: { marginHorizontal: 16, marginTop: 14, padding: 16, borderRadius: R.xl + 2 },
  legendRow: { flexDirection: 'row', marginBottom: 10 },
  periodTag: {
    marginLeft: 'auto',
    alignSelf: 'flex-start',
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  legend: { gap: 3, marginRight: 22, flexShrink: 1 },
  leftHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  toggle: { flexDirection: 'row', backgroundColor: C.pill, borderRadius: R.pill, padding: 3 },
  toggleBtn: { width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  insightHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  insightEmpty: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 14, gap: 4 },
  budgetRow: { paddingVertical: 8, gap: 8 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
