import { format, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Empty } from '@/components/empty';
import { ModalHeader } from '@/components/modal-header';
import { Section } from '@/components/section';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { getDb } from '@/db/client';
import { deleteRecurringRule, updateRecurringRule } from '@/db/queries/recurring';
import { useMoney } from '@/hooks/ledger';
import { confirmAction } from '@/lib/dialog';
import { useData } from '@/store/data';
import { C } from '@/theme';
import type { RecurringRule } from '@/types';

const FREQ = { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' } as const;

export default function RecurringScreen() {
  const money = useMoney();
  const recurring = useData((s) => s.recurring);
  const categories = useData((s) => s.categories);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const setActive = async (r: RecurringRule, active: boolean) => {
    // Resuming a paused rule should not back-fill everything missed while it was paused.
    const today = format(new Date(), 'yyyy-MM-dd');
    await updateRecurringRule(getDb(), r.id, { active, ...(active && r.nextRunDate < today ? { nextRunDate: today } : {}) });
    await useData.getState().reload();
  };

  const remove = (r: RecurringRule) =>
    confirmAction({
      title: 'Stop repeating?',
      message: 'Past transactions are kept; no new ones will be created.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const db = getDb();
        await db.runAsync('UPDATE transactions SET recurring_rule_id = NULL WHERE recurring_rule_id = ?', r.id);
        await deleteRecurringRule(db, r.id);
        await useData.getState().reload();
      },
    });

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <ModalHeader title="Recurring" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {recurring.length === 0 ? (
          <Empty emoji="🔁" title="No recurring transactions" message="Tap ↻ on the add-transaction screen to make a transaction repeat weekly, monthly or yearly." />
        ) : (
          <Section footer="Due transactions are added automatically when you open the app.">
            {recurring.map((r) => {
              const c = catById.get(r.categoryId);
              return (
                <View key={r.id} style={[styles.row, !r.active && { opacity: 0.55 }]}>
                  <T style={{ fontSize: 24 }}>{c?.icon ?? '📦'}</T>
                  <View style={{ flex: 1 }}>
                    <T variant="body" numberOfLines={1}>
                      {r.note || c?.name || 'Recurring'}
                    </T>
                    <T variant="caption" tone="secondary">
                      {FREQ[r.frequency]} · {r.active ? `next ${format(parseISO(r.nextRunDate), 'd MMM yyyy')}` : 'paused'}
                    </T>
                    <T variant="small" tone={r.type === 'income' ? 'green' : 'primary'} style={{ marginTop: 2 }}>
                      {money(r.amount, r.currencyCode)}
                    </T>
                  </View>
                  <Toggle value={r.active} onChange={(v) => setActive(r, v)} accessibilityLabel={r.active ? 'Pause' : 'Resume'} />
                  <Pressable onPress={() => remove(r)} hitSlop={8} accessibilityLabel="Delete recurring rule" style={{ padding: 6 }}>
                    <Trash2 size={20} color={C.red} />
                  </Pressable>
                </View>
              );
            })}
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
