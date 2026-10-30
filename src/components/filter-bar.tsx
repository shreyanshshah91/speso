import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { CategoryFilterSheet } from '@/components/category-filter-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { PeriodSheet } from '@/components/period-sheet';
import { Pill } from '@/components/ui/pill';
import { PERIOD_PILL } from '@/lib/period';
import { useData } from '@/store/data';
import { filterActions, useFilters, usePrefs, type ActivityType, type FilterScope, type SortKind } from '@/store/prefs';

export const TYPE_LABEL: Record<ActivityType, string> = {
  all: 'All activity',
  expense: 'Expenses',
  income: 'Income',
  transfer: 'Transfers',
};

export const SORT_OPTIONS: { value: SortKind; label: string }[] = [
  { value: 'date_desc', label: 'Date, new first' },
  { value: 'date_asc', label: 'Date, old first' },
  { value: 'amount_desc', label: 'Amount, high to low' },
  { value: 'amount_asc', label: 'Amount, low to high' },
  { value: 'name', label: 'Name' },
];

interface Props {
  scope: FilterScope;
  /** 'activity' offers All / Expenses / Income / Transfers; 'summary' only Expenses / Income. */
  typeMode?: 'activity' | 'summary' | 'none';
  showCategories?: boolean;
  showSort?: boolean;
  onSearch?: () => void;
}

type SheetName = 'type' | 'period' | 'account' | 'category' | 'sort' | null;

/** Horizontally scrolling row of filter pills, each opening its own sheet. */
export function FilterBar({ scope, typeMode = 'activity', showCategories = true, showSort = false, onSearch }: Props) {
  const f = useFilters(scope);
  const actions = filterActions(scope);
  const accounts = useData((s) => s.accounts);
  const categories = useData((s) => s.categories);
  const [open, setOpen] = useState<SheetName>(null);
  // Activity's type default is the user's choice ("Make it default"); elsewhere it's Expenses.
  const savedDefault = usePrefs((s) => s.defaultActivityType);
  const canSetDefault = scope === 'activity' && typeMode === 'activity';
  const defaultType: ActivityType = canSetDefault ? savedDefault : 'expense';

  const accountLabel = f.accountId === null ? 'All accounts' : (accounts.find((a) => a.id === f.accountId)?.name ?? 'Account');
  const categoryLabel =
    f.categoryIds === null
      ? 'All categories'
      : f.categoryIds.length === 1
        ? (categories.find((c) => c.id === f.categoryIds![0])?.name ?? '1 category')
        : `${f.categoryIds.length} categories`;
  const typeOptions: ActivityType[] = typeMode === 'activity' ? ['all', 'expense', 'income', 'transfer'] : ['expense', 'income'];
  const sortLabel = f.sort === 'date_desc' ? 'Sort by' : (SORT_OPTIONS.find((o) => o.value === f.sort)?.label ?? 'Sort by');

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {onSearch ? <Pill icon={<Search size={20} color="#fff" />} onPress={onSearch} accessibilityLabel="Search" /> : null}
        {/* A pill that differs from its default gets a white ring and an ⓧ that resets it. */}
        {typeMode !== 'none' ? (
          <Pill label={TYPE_LABEL[f.type]} onPress={() => setOpen('type')} active={f.type !== defaultType} onClear={() => actions.setType(defaultType)} />
        ) : null}
        <Pill label={PERIOD_PILL[f.period]} onPress={() => setOpen('period')} active={f.period !== 'monthly'} onClear={() => actions.setPeriod('monthly')} />
        <Pill label={accountLabel} onPress={() => setOpen('account')} active={f.accountId !== null} onClear={() => actions.setAccountId(null)} />
        {showCategories && f.type !== 'transfer' ? (
          <Pill label={categoryLabel} onPress={() => setOpen('category')} active={f.categoryIds !== null} onClear={() => actions.setCategoryIds(null)} />
        ) : null}
        {showSort ? <Pill label={sortLabel} onPress={() => setOpen('sort')} active={f.sort !== 'date_desc'} onClear={() => actions.setSort('date_desc')} /> : null}
      </ScrollView>

      <OptionsSheet<ActivityType>
        visible={open === 'type'}
        onClose={() => setOpen(null)}
        title="Type"
        value={f.type}
        defaultValue={defaultType}
        onMakeDefault={canSetDefault ? (t) => usePrefs.getState().set('defaultActivityType', t) : undefined}
        onSelect={actions.setType}
        options={typeOptions.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
      />
      <PeriodSheet visible={open === 'period'} onClose={() => setOpen(null)} scope={scope} />
      <OptionsSheet<number | null>
        visible={open === 'account'}
        onClose={() => setOpen(null)}
        title="Accounts"
        value={f.accountId}
        defaultValue={null}
        onSelect={actions.setAccountId}
        options={[{ value: null, label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon }))]}
      />
      <CategoryFilterSheet
        visible={open === 'category'}
        onClose={() => setOpen(null)}
        value={f.categoryIds}
        onChange={actions.setCategoryIds}
        initialType={f.type === 'income' ? 'income' : 'expense'}
      />
      <OptionsSheet<SortKind>
        visible={open === 'sort'}
        onClose={() => setOpen(null)}
        title="Sort by"
        subtitle="This filter will be applied per month"
        value={f.sort}
        defaultValue="date_desc"
        onSelect={actions.setSort}
        options={SORT_OPTIONS}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8 },
});
