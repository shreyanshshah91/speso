import { Menu, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryFormSheet } from '@/components/category-form-sheet';
import { CategoryIcon } from '@/components/category-icon';
import { ModalHeader } from '@/components/modal-header';
import { SortableList } from '@/components/sortable-list';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { T } from '@/components/ui/text';
import { getDb } from '@/db/client';
import { reorderCategories } from '@/db/queries/categories';
import { useData } from '@/store/data';
import { C, R } from '@/theme';
import type { Category, TransactionType } from '@/types';

const ROW_H = 64;

export default function CategoriesScreen() {
  const categories = useData((s) => s.categories);
  const transactions = useData((s) => s.transactions);
  const [type, setType] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);

  const list = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of transactions) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [transactions]);

  const onReorder = async (keys: string[]) => {
    await reorderCategories(getDb(), keys.map(Number));
    await useData.getState().reload();
  };

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <ModalHeader
        title="Categories"
        right={
          <IconButton accessibilityLabel="Add category" onPress={() => setEditing(null)}>
            <Plus size={22} color="#fff" />
          </IconButton>
        }
      />
      <View style={styles.seg}>
        <Segmented<TransactionType>
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SortableList
          itemHeight={ROW_H}
          onReorder={onReorder}
          items={list.map((c) => ({
            key: String(c.id),
            render: (Handle) => (
              <Pressable style={styles.row} onPress={() => setEditing(c)} accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`}>
                <CategoryIcon icon={c.icon} color={c.color} outlined size={38} />
                <T variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {c.name}
                </T>
                <T variant="small" tone="tertiary">
                  {counts.get(c.id) ?? 0}
                </T>
                <Handle>
                  <View style={{ padding: 8 }} accessibilityLabel="Drag to reorder">
                    <Menu size={20} color={C.text2} />
                  </View>
                </Handle>
              </Pressable>
            ),
          }))}
        />
        <T variant="caption" tone="tertiary" center style={{ marginTop: 12 }}>
          Hold ≡ and drag to reorder. Tap a category to edit it.
        </T>
      </ScrollView>
      <CategoryFormSheet visible={editing !== undefined} onClose={() => setEditing(undefined)} type={type} category={editing ?? null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { alignItems: 'center', marginBottom: 14 },
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: ROW_H - 6,
    paddingHorizontal: 10,
    borderRadius: R.lg,
    backgroundColor: C.cardStrong,
  },
});
