import { format, isSameYear, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Empty } from '@/components/empty';
import { AverageInfoSheet } from '@/components/average-info-sheet';
import { AddFab } from '@/components/fab';
import { FilterBar } from '@/components/filter-bar';
import { OptionsSheet } from '@/components/options-sheet';
import { PeriodHeader } from '@/components/period-header';
import { SpendBars } from '@/components/spend-bars';
import { SwipePeriod } from '@/components/swipe-period';
import { TransferSheet } from '@/components/transfer-sheet';
import { TxRow } from '@/components/tx-row';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useKeyboardSpacer } from '@/hooks/keyboard';
import { filterTransactions, percentChange, useConvert, useMoney, usePeriod } from '@/hooks/ledger';
import { duplicateTransaction, removeTransaction, removeTransfer } from '@/lib/actions';
import { buildBars, type Entry } from '@/lib/buckets';
import { confirmAction } from '@/lib/dialog';
import { formatDayHeader, toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { useData } from '@/store/data';
import { useFilters, usePrefs, type ActivityType, type FilterScope } from '@/store/prefs';
import { CHART_H, C, F } from '@/theme';
import type { AccountTransfer, TransactionWithCategory } from '@/types';

type Item =
  | { kind: 'tx'; key: string; date: string; amount: number; name: string; data: TransactionWithCategory }
  | { kind: 'transfer'; key: string; date: string; amount: number; name: string; data: AccountTransfer };

interface Section {
  key: string;
  title: string;
  total: number;
  data: Item[];
}

export interface LedgerViewProps {
  scope: FilterScope;
  /** Top bar content (settings button, or back / edit buttons on a category page). */
  topBar: React.ReactNode;
  tint?: 'default' | 'blue' | 'teal';
  /** Custom background tint colour, e.g. the category colour. */
  topColor?: string;
  /** Colour of the chart bars. */
  barColor?: string;
  /** Fixed label replacing the period title (e.g. the category name). */
  title?: string;
  /** Lock the view to one category (category pages). */
  categoryId?: number;
  typeMode: 'activity' | 'summary' | 'none';
  showCategories: boolean;
  /** Where the + button goes. */
  fabHref?: string;
}

/** Signed contribution of an item to a total for the given type filter. */
function contribution(item: Item, type: ActivityType): number {
  if (item.kind === 'transfer') return type === 'transfer' ? item.amount : 0;
  if (type === 'all') return item.data.type === 'income' ? item.amount : -item.amount;
  return item.amount;
}

/** Period header + daily chart + filter pills + grouped transaction list. Used by the Activity tab
 * and by category pages opened from Summary. */
export function LedgerView({ scope, topBar, tint = 'blue', topColor, barColor, title, categoryId, typeMode, showCategories, fabHref }: LedgerViewProps) {
  const { contentPadding: tabSpace } = useTabBarInsets();
  const router = useRouter();
  const money = useMoney();
  const convert = useConvert();
  const filters = useFilters(scope);
  const period = usePeriod(scope);
  const categories = useData((s) => s.categories);
  const lockedCategory = categoryId !== undefined ? categories.find((c) => c.id === categoryId) : undefined;
  // A category page is locked to that category and its type.
  const f = useMemo(
    () => (lockedCategory ? { ...filters, type: lockedCategory.type as ActivityType, categoryIds: [lockedCategory.id] } : filters),
    [filters, lockedCategory]
  );
  const hidden = usePrefs((s) => s.hideBalances);
  const weekStartDay = usePrefs((s) => s.weekStartDay);
  const allTx = useData((s) => s.ledger);
  const transfers = useData((s) => s.transfers);
  const accounts = useData((s) => s.accounts);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<TransactionWithCategory | null>(null);
  const [avgInfo, setAvgInfo] = useState(false);
  const [editTransfer, setEditTransfer] = useState<AccountTransfer | null>(null);
  const keyboardSpacer = useKeyboardSpacer();

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  /** All items (transactions + transfers) in a date range, honouring type/account/category filters. */
  const itemsIn = useMemo(
    () =>
      (from?: string, to?: string): Item[] => {
        const out: Item[] = [];
        if (f.type !== 'transfer') {
          const txs = filterTransactions(allTx, {
            from,
            to,
            type: f.type === 'all' ? null : f.type,
            accountId: f.accountId,
            categoryIds: f.categoryIds,
          });
          for (const t of txs) {
            // Monthly shares of a spread entry share its id, so the share number keeps keys unique.
            out.push({ kind: 'tx', key: t.part ? `t${t.id}.${t.part.index}` : `t${t.id}`, date: t.date, amount: convert(t.amount, t.currencyCode), name: t.note || t.categoryName, data: t });
          }
        }
        if ((f.type === 'all' || f.type === 'transfer') && f.categoryIds === null) {
          for (const tr of transfers) {
            if ((from && tr.date < from) || (to && tr.date > to)) continue;
            if (f.accountId !== null && tr.fromAccountId !== f.accountId && tr.toAccountId !== f.accountId) continue;
            const name = `${accountName.get(tr.fromAccountId) ?? 'Account'} → ${accountName.get(tr.toAccountId) ?? 'Account'}`;
            out.push({ kind: 'transfer', key: `x${tr.id}`, date: tr.date, amount: convert(tr.amount, tr.currencyCode), name, data: tr });
          }
        }
        return out;
      },
    [allTx, transfers, f.type, f.accountId, f.categoryIds, convert, accountName]
  );

  const periodItems = useMemo(() => itemsIn(period.from, period.to), [itemsIn, period.from, period.to]);
  const total = useMemo(() => periodItems.reduce((s, it) => s + contribution(it, f.type), 0), [periodItems, f.type]);
  // "All activity" reads like the reference: the headline and chart are spending, with the
  // period's income on a green line underneath.
  const allMode = f.type === 'all';
  const { spent, earned } = useMemo(() => {
    let out = 0;
    let inc = 0;
    for (const it of periodItems) {
      if (it.kind !== 'tx') continue;
      if (it.data.type === 'income') inc += it.amount;
      else out += it.amount;
    }
    return { spent: out, earned: inc };
  }, [periodItems]);
  const prevTotal = useMemo(
    () => (period.previous ? itemsIn(period.previous.from, period.previous.to).reduce((s, it) => s + contribution(it, f.type), 0) : 0),
    [itemsIn, period.previous, f.type]
  );

  const { bars, average } = useMemo(() => {
    const source = f.type === 'all' ? periodItems.filter((it) => it.kind === 'tx' && it.data.type !== 'income') : periodItems;
    const entries: Entry[] = source.map((it) => ({ date: it.date, value: it.amount, secondary: false }));
    return buildBars(period, entries, weekStartDay);
  }, [periodItems, period, f.type, weekStartDay]);

  const listItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return periodItems;
    return itemsIn().filter((it) => it.name.toLowerCase().includes(q) || (it.kind === 'tx' && it.data.categoryName.toLowerCase().includes(q)));
  }, [query, periodItems, itemsIn]);

  const byDate = f.sort === 'date_desc' || f.sort === 'date_asc';

  const sections = useMemo<Section[]>(() => {
    const items = [...listItems];
    const tie = (a: Item, b: Item) => b.data.id - a.data.id;
    items.sort((a, b) => {
      switch (f.sort) {
        case 'date_asc':
          return a.date < b.date ? -1 : a.date > b.date ? 1 : -tie(a, b);
        case 'amount_desc':
          return b.amount - a.amount;
        case 'amount_asc':
          return a.amount - b.amount;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return a.date < b.date ? 1 : a.date > b.date ? -1 : tie(a, b);
      }
    });
    // Date sorts group by day; the other sorts are applied within each month.
    const now = new Date();
    const map = new Map<string, Section>();
    for (const it of items) {
      const k = byDate ? it.date : it.date.slice(0, 7);
      let s = map.get(k);
      if (!s) {
        const d = parseISO(byDate ? k : `${k}-01`);
        const title = byDate ? formatDayHeader(k) : format(d, isSameYear(d, now) ? 'MMMM' : 'MMMM yyyy');
        s = { key: k, title, total: 0, data: [] };
        map.set(k, s);
      }
      s.total += contribution(it, f.type);
      s.data.push(it);
    }
    const list = [...map.values()];
    if (!byDate) list.sort((a, b) => (a.key < b.key ? 1 : -1));
    return list;
  }, [listItems, f.sort, f.type, byDate]);

  const signed = f.type === 'all';
  // While searching (which looks across all dates) the period chart steps aside so the field sits
  // at the top and results stay visible above the keyboard, even on short screens.
  const header = (
    <View>
      {searching ? null : (
        <>
          {/* A little room above the title: a negative offset here clipped "This month" on Android. */}
          <View style={{ paddingTop: 4 }}>
            <PeriodHeader
              scope={scope}
              title={title}
              period={period}
              amountText={allMode ? money(spent) : money(total, undefined, { signed })}
              change={signed ? null : percentChange(total, prevTotal)}
              note={allMode ? `Income ${money(earned)}` : undefined}
              upIsGood={f.type === 'income'}
            />
          </View>
          <SwipePeriod scope={scope}>
            <View style={{ paddingRight: 4, marginTop: 8 }}>
              <SpendBars bars={bars} average={average} height={CHART_H} hidden={hidden} color={barColor} onPressAverage={() => setAvgInfo(true)} />
            </View>
          </SwipePeriod>
        </>
      )}
      <View style={{ marginTop: searching ? 8 : 18, marginBottom: 4, minHeight: 38 }}>
        {searching ? (
          <View style={styles.searchRow}>
            <TextField
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or category"
              placeholderTextColor={C.text3}
              style={styles.search}
              returnKeyType="search"
              maxLength={60}
              autoCorrect={false}
            />
            <Pressable
              accessibilityLabel="Close search"
              style={styles.closeSearch}
              onPress={() => {
                setSearching(false);
                setQuery('');
              }}>
              <X size={20} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <FilterBar scope={scope} typeMode={typeMode} showCategories={showCategories} showSort onSearch={() => setSearching(true)} />
        )}
      </View>
    </View>
  );

  return (
    <Screen tint={tint} topColor={topColor}>
      {topBar}
      <SectionList
        sections={sections}
        keyExtractor={(it) => it.key}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        ListFooterComponent={<Animated.View style={keyboardSpacer} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <T variant="body" tone="secondary" style={styles.dayHeaderText}>
              {section.title}
            </T>
            <T variant="body" tone="secondary" style={styles.dayHeaderText}>
              {money(section.total, undefined, { signed })}
            </T>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          if (item.kind === 'transfer') {
            const tr = item.data;
            return (
              <TxRow
                icon="↔️"
                title={item.name}
                subtitle={tr.note || 'Transfer'}
                amount={money(tr.amount, tr.currencyCode)}
                amountTone="secondary"
                first={first}
                last={last}
                onPress={() => setEditTransfer(tr)}
                onLongPress={() => confirmAction({ title: 'Delete transfer?', confirmLabel: 'Delete', onConfirm: () => removeTransfer(tr.id) })}
              />
            );
          }
          const t = item.data;
          const income = t.type === 'income';
          return (
            <TxRow
              icon={t.categoryIcon}
              title={item.name}
              subtitle={
                [query || !byDate ? formatDayHeader(t.date) : null, t.part ? `${t.part.index} of ${t.part.of} · ${money(t.part.total, t.currencyCode)} spread` : null]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              amount={money(t.amount, t.currencyCode, { signed: income && signed })}
              amountTone={income ? 'green' : 'primary'}
              recurring={t.recurringRuleId !== null}
              first={first}
              last={last}
              onPress={() => router.push(`/transaction/${t.id}`)}
              onLongPress={() => {
                haptic.tap();
                setMenuFor(t);
              }}
            />
          );
        }}
        ListEmptyComponent={
          <Empty
            emoji={query ? '🔍' : '🧾'}
            title={query ? 'No matches' : 'Nothing here yet'}
            message={query ? 'Try a different search.' : 'Tap + to add a transaction.'}
          />
        }
      />
      <AddFab href={fabHref} />
      <AverageInfoSheet visible={avgInfo} onClose={() => setAvgInfo(false)} />
      <TransferSheet visible={editTransfer !== null} transfer={editTransfer} onClose={() => setEditTransfer(null)} />
      <OptionsSheet<string>
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? menuFor.note || menuFor.categoryName : ''}
        value=""
        options={[
          { value: 'edit', label: 'Edit', icon: '✏️' },
          { value: 'duplicate', label: 'Duplicate to today', icon: '📄' },
          { value: 'delete', label: 'Delete', icon: '🗑️' },
        ]}
        onSelect={(v) => {
          const t = menuFor;
          if (!t) return;
          if (v === 'edit') router.push(`/transaction/${t.id}`);
          if (v === 'duplicate') duplicateTransaction(t, toISODate(new Date())).then(() => haptic.success());
          if (v === 'delete') {
            setTimeout(
              () => confirmAction({ title: 'Delete transaction?', message: 'This cannot be undone.', confirmLabel: 'Delete', onConfirm: () => removeTransaction(t.id) }),
              250
            );
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  dayHeaderText: { fontSize: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  search: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.pill,
    color: C.text,
    paddingHorizontal: 20,
    fontSize: 16,
    fontFamily: F.regular,
    outlineWidth: 0,
  },
  closeSearch: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.pill, alignItems: 'center', justifyContent: 'center' },
});
