import { useRouter } from 'expo-router';
import { Pencil, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryFormSheet } from '@/components/category-form-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { uniformLabelSize } from '@/lib/fit-text';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { C } from '@/theme';
import type { TransactionType } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedId: number | null;
  initialType: TransactionType;
  onSelect: (id: number, type: TransactionType) => void;
}

/** Four-column grid of categories with an Expense / Income switch and an "Add new" tile. */
export function CategoryGridSheet({ visible, onClose, selectedId, initialType, onSelect }: Props) {
  const router = useRouter();
  const categories = useData((s) => s.categories);
  const [type, setType] = useState<TransactionType>(initialType);
  const [adding, setAdding] = useState(false);
  const [gridW, setGridW] = useState(0);
  // Four columns with even gutters, sized from the measured width so tiles never crowd.
  const gap = gridW > 0 && gridW < 330 ? 8 : 12;
  const tileW = gridW > 0 ? Math.floor((gridW - 4 - 3 * gap) / 4) : 0;
  // Explicit height (a touch taller than wide): Android ignored aspectRatio here, so tiles took
  // their text's height and changed size whenever the label did.
  const tileH = Math.round(tileW * 1.03);
  const list = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  // One label size for every tile in both the Expense and Income tabs (and both category grids),
  // fitted to the tile width and the app's category names; longer names end with an ellipsis.
  const labelSize = tileW > 0 ? uniformLabelSize([...categories.map((c) => c.name), 'Add new'], tileW - 12, tileW < 78 ? 14 : 15, 12, 10) : 14;
  const labelStyle = { fontSize: labelSize, lineHeight: Math.round(labelSize * 1.22) };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      headerRight={
        <IconButton
          accessibilityLabel="Edit categories"
          size={40}
          solid="rgba(80,88,94,0.6)"
          onPress={() => {
            onClose();
            router.push('/settings/categories');
          }}>
          <Pencil size={18} color="#fff" />
        </IconButton>
      }
      headerLeft={<View />}
      headerCenter={
        <Segmented<TransactionType>
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
      }>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, { gap }]} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          {list.map((c) => {
            const selected = c.id === selectedId;
            return (
              <Pressable
                key={c.id}
                style={[styles.tile, tileW ? { width: tileW, height: tileH } : null, selected && styles.tileSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={c.name}
                onPress={() => {
                  haptic.select();
                  onSelect(c.id, c.type);
                  onClose();
                }}>
                <T style={{ fontSize: 28, lineHeight: 34 }} maxFontSizeMultiplier={1.1}>
                  {c.icon}
                </T>
                <T variant="small" numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.1} style={[styles.tileLabel, labelStyle]}>
                  {c.name}
                </T>
              </Pressable>
            );
          })}
          <Pressable style={[styles.tile, tileW ? { width: tileW, height: tileH } : null, styles.addTile]} onPress={() => setAdding(true)} accessibilityLabel="Add category">
            <Plus size={22} color={C.text2} />
            <T variant="small" tone="secondary" numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.1} style={[styles.tileLabel, labelStyle]}>
              Add new
            </T>
          </Pressable>
        </View>
      </ScrollView>
      <CategoryFormSheet
        visible={adding}
        onClose={() => setAdding(false)}
        type={type}
        category={null}
        onSaved={(id) => {
          onSelect(id, type);
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 8, paddingTop: 8, paddingHorizontal: 2 },
  tile: {
    width: '22%',
    aspectRatio: 0.97,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  tileSelected: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  tileLabel: { alignSelf: 'stretch', textAlign: 'center' },
  addTile: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' },
});
