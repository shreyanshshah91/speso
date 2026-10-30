import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ModalHeader } from '@/components/modal-header';
import { Card, Divider } from '@/components/ui/card';
import { GradientButton } from '@/components/ui/gradient-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getDb } from '@/db/client';
import { deleteBudget, upsertBudget } from '@/db/queries/budgets';
import { amountToInput, parseAmountInput } from '@/lib/amount-input';
import { currencySymbol } from '@/lib/currencies';
import { confirmAction, showAlert } from '@/lib/dialog';
import { toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/validate';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C, F } from '@/theme';

export default function BudgetEditScreen() {
  const router = useRouter();
  const budgets = useData((s) => s.budgets);
  const categories = useData((s) => s.categories);
  const home = usePrefs((s) => s.homeCurrency);
  const fmt = usePrefs((s) => s.currencyFormat);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of budgets) init[b.categoryId === null ? 'all' : String(b.categoryId)] = amountToInput(b.amount, fmt);
    return init;
  });

  const setVal = (key: string, text: string) => setValues((v) => ({ ...v, [key]: text }));

  const save = async () => {
    const db = getDb();
    const byKey = new Map(budgets.map((b) => [b.categoryId === null ? 'all' : String(b.categoryId), b]));
    const keys = ['all', ...expenseCats.map((c) => String(c.id))];
    for (const key of keys) {
      const raw = values[key]?.trim() ?? '';
      if (raw === '') continue;
      const amount = parseAmountInput(raw, fmt);
      if (amount === null || amount > LIMITS.maxAmount) {
        showAlert('Invalid amount', 'Please check the amounts you entered.');
        return;
      }
    }
    await db.withTransactionAsync(async () => {
      for (const key of keys) {
        const existing = byKey.get(key);
        const amount = parseAmountInput(values[key]?.trim() ?? '', fmt);
        if (!amount) {
          if (existing) await deleteBudget(db, existing.id);
          continue;
        }
        await upsertBudget(db, {
          id: existing?.id,
          categoryId: key === 'all' ? null : Number(key),
          accountId: null,
          amount,
          currencyCode: home,
          period: 'monthly',
          startDate: existing?.startDate ?? toISODate(new Date()),
        });
      }
    });
    await useData.getState().reload();
    haptic.success();
    if (router.canGoBack()) router.back();
    else router.replace('/budget');
  };

  const clearAll = () =>
    confirmAction({
      title: 'Remove all budgets?',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        await getDb().runAsync('DELETE FROM budgets');
        await useData.getState().reload();
        if (router.canGoBack()) router.back();
        else router.replace('/budget');
      },
    });

  const symbol = currencySymbol(home);

  const input = (key: string, placeholder: string, label: string) => (
    <View style={styles.inputWrap}>
      <T variant="body" tone="secondary">
        {symbol}
      </T>
      <TextField
        value={values[key] ?? ''}
        onChangeText={(t) => setVal(key, t)}
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        keyboardType="decimal-pad"
        style={styles.input}
        accessibilityLabel={`Budget for ${label}`}
        maxLength={16}
      />
    </View>
  );

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <ModalHeader title="Budget" />
      {/* Scrolls the focused amount field into view above the keyboard. */}
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <T variant="small" tone="secondary" style={styles.section}>
            Monthly total
          </T>
          <Card>
            <View style={styles.row}>
              <T style={{ fontSize: 22 }}>🎯</T>
              <View style={{ flex: 1 }}>
                <T variant="body">All spending</T>
                <T variant="caption" tone="secondary">
                  Optional. Leave empty to use the sum of categories.
                </T>
              </View>
              {input('all', '0', 'all spending')}
            </View>
          </Card>

          <T variant="small" tone="secondary" style={styles.section}>
            Categories
          </T>
          <Card>
            {expenseCats.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <T style={{ fontSize: 22 }}>{c.icon}</T>
                  <T variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {c.name}
                  </T>
                  {input(String(c.id), '—', c.name)}
                </View>
              </View>
            ))}
          </Card>

          <View style={{ marginTop: 28 }}>
            <GradientButton label="Save budget" onPress={save} />
          </View>
          {budgets.length > 0 ? (
            <Pressable onPress={clearAll} style={{ alignSelf: 'center', padding: 16, marginTop: 8 }} accessibilityRole="button" accessibilityLabel="Remove all budgets">
              <T variant="body" tone="red">
                Remove all budgets
              </T>
            </Pressable>
          ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  section: { marginTop: 20, marginBottom: 10, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 58 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
    minWidth: 110,
  },
  input: { flex: 1, color: C.text, fontSize: 17, fontFamily: F.medium, textAlign: 'right', paddingVertical: 0, outlineWidth: 0 },
});
