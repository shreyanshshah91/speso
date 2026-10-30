import { useRouter } from 'expo-router';
import { Check, Pencil, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryFormSheet } from '@/components/category-form-sheet';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { useOnOpen } from '@/hooks/use-on-open';
import { uniformLabelSize } from '@/lib/fit-text';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { C } from '@/theme';
import type { TransactionType } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Currently applied filter (null = all categories). */
  value: number[] | null;
  onChange: (ids: number[] | null) => void;
  initialType: TransactionType;
}


/** Category filter grid: "All" plus multi-select tiles with check badges, confirmed with a button. */
export function CategoryFilterSheet({ visible, onClose, value, onChange, initialType }: Props) {
  const router = useRouter();
  const categories = useData((s) => s.categories);
  const [type, setType] = useState<TransactionType>(initialType);
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const [adding, setAdding] = useState(false);
  const [gridW, setGridW] = useState(0);
  // Four columns with even gutters, sized from the measured width so tiles never crowd.
  const gap = gridW > 0 && gridW < 330 ? 8 : 12;
  const tileW = gridW > 0 ? Math.floor((gridW - 4 - 3 * gap) / 4) : 0;
  // Explicit height (a touch taller than wide): Android ignored aspectRatio here, so tiles took
  // their text's height and changed size whenever the label did.
  const tileH = Math.round(tileW * 1.03);

  useOnOpen(visible, () => {
    setType(initialType);
    setDraft(value ? new Set(value) : null);
  });

  const list = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  // One label size for every tile in both the Expense and Income tabs (and both category grids),
  // fitted to the tile width and the app's category names; longer names end with an ellipsis.
  const labelSize = tileW > 0 ? uniformLabelSize([...categories.map((c) => c.name), 'All', 'Add new'], tileW - 12, tileW < 78 ? 14 : 15, 12, 10) : 14;
  const labelStyle = { fontSize: labelSize, lineHeight: Math.round(labelSize * 1.22) };
  const allOn = draft === null;

  const toggle = (id: number) => {
    haptic.select();
    setDraft((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });
  };

  const tile = (key: string | number, label: string, icon: React.ReactNode, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[styles.tile, tileW ? { width: tileW, height: tileH } : null, on && styles.tileOn]}>
      {icon}
      <T variant="small" numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.1} style={[styles.tileLabel, labelStyle]}>
        {label}
      </T>
      {on ? (
        <View style={styles.check}>
          <Check size={12} color="#111" strokeWidth={3.5} />
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
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
      }
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
      }>
      <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, { gap }]} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          {tile('all', 'All', <AllIcon />, allOn, () => {
            haptic.select();
            setDraft(null);
          })}
          {list.map((c) => tile(c.id, c.name, <T style={{ fontSize: 28 }}>{c.icon}</T>, !!draft?.has(c.id), () => toggle(c.id)))}
          <Pressable
            style={[styles.tile, tileW ? { width: tileW, height: tileH } : null, styles.addTile]}
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel="Add category">
            <Plus size={22} color={C.text2} />
            <T variant="small" tone="secondary" numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.1} style={[styles.tileLabel, labelStyle]}>
              Add new
            </T>
          </Pressable>
        </View>
      </ScrollView>
      <View style={{ marginTop: 16 }}>
        <GradientButton
          label="Confirm"
          variant="light"
          height={52}
          onPress={() => {
            onChange(draft ? [...draft] : null);
            onClose();
          }}
        />
      </View>
      <CategoryFormSheet visible={adding} onClose={() => setAdding(false)} type={type} category={null} />
    </Sheet>
  );
}

function AllIcon() {
  return (
    <View style={styles.allIcon}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.allDot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 10, paddingBottom: 4, paddingHorizontal: 2 },
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
  tileLabel: { alignSelf: 'stretch', textAlign: 'center' },
  tileOn: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  check: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.sheet,
  },
  addTile: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' },
  allIcon: { width: 28, height: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignContent: 'center', justifyContent: 'center' },
  allDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.8, borderColor: '#FFFFFF' },
});
