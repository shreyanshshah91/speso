import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateSheet } from '@/components/date-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { T } from '@/components/ui/text';
import { toISODate } from '@/lib/format';
import { PERIOD_OPTIONS, type PeriodKind } from '@/lib/period';
import { filterActions, useFilters, type FilterScope } from '@/store/prefs';

interface Props {
  visible: boolean;
  onClose: () => void;
  scope: FilterScope;
}

/** "Time period" sheet. Choosing Custom reveals From / To date fields. */
export function PeriodSheet({ visible, onClose, scope }: Props) {
  const { period, customFrom, customTo } = useFilters(scope);
  const { setPeriod, setCustomRange } = filterActions(scope);
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);

  const pickDate = (iso: string) => {
    if (editing === 'from') setCustomRange(iso, customTo && customTo < iso ? iso : customTo);
    else setCustomRange(customFrom && customFrom > iso ? iso : customFrom, iso);
    const bothSet = editing === 'from' ? !!customTo : !!customFrom;
    if (bothSet) setTimeout(onClose, 150);
  };

  const field = (which: 'from' | 'to', value: string | null) => (
    <Pressable
      style={styles.field}
      onPress={() => setEditing(which)}
      accessibilityRole="button"
      accessibilityLabel={which === 'from' ? 'From date' : 'To date'}>
      <T variant="body" tone={value ? 'primary' : 'tertiary'}>
        {value ? format(parseISO(value), 'd MMM yyyy') : which === 'from' ? 'From' : 'To'}
      </T>
    </Pressable>
  );

  return (
    <>
      <OptionsSheet<PeriodKind>
        visible={visible}
        onClose={onClose}
        title="Time period"
        options={PERIOD_OPTIONS}
        value={period}
        defaultValue="monthly"
        onSelect={setPeriod}
        keepOpen={(v) => v === 'custom'}
        footer={
          period === 'custom' ? (
            <View style={styles.fields}>
              {field('from', customFrom)}
              {field('to', customTo)}
            </View>
          ) : null
        }
      />
      <DateSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        value={(editing === 'from' ? customFrom : customTo) ?? toISODate(new Date())}
        onChange={pickDate}
        allowFuture
      />
    </>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: 8 },
  field: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
});

