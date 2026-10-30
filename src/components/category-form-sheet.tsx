import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ColorSheet, EmojiSheet } from '@/components/pickers';
import { GradientButton } from '@/components/ui/gradient-button';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getDb } from '@/db/client';
import { createCategory, deleteCategory, updateCategory } from '@/db/queries/categories';
import { useOnOpen } from '@/hooks/use-on-open';
import { confirmAction, showAlert } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { LIMITS, cleanIcon, cleanText, isValidColor } from '@/lib/validate';
import { useData } from '@/store/data';
import { C, F, PALETTE } from '@/theme';
import type { Category, TransactionType } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  type: TransactionType;
  /** Category to edit, or null to create one. */
  category: Category | null;
  onSaved?: (id: number) => void;
}

export function CategoryFormSheet({ visible, onClose, type, category, onSaved }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState<string>(PALETTE[2]);
  const [picker, setPicker] = useState<'emoji' | 'color' | null>(null);

  useOnOpen(visible, () => {
    setName(category?.name ?? '');
    setIcon(category?.icon ?? '🎯');
    setColor(category?.color ?? PALETTE[(Date.now() >> 8) % PALETTE.length]);
  });

  const save = async () => {
    const clean = cleanText(name, LIMITS.name);
    if (!clean) {
      showAlert('Name required', 'Give the category a name.');
      return;
    }
    const input = { name: clean, icon: cleanIcon(icon, '🎯'), color: isValidColor(color) ? color : PALETTE[0] };
    const db = getDb();
    let id = category?.id;
    if (category) await updateCategory(db, category.id, input);
    else id = await createCategory(db, { ...input, type });
    await useData.getState().reload();
    haptic.success();
    if (id) onSaved?.(id);
    onClose();
  };

  const remove = () => {
    if (!category) return;
    const used = useData.getState().transactions.some((t) => t.categoryId === category.id);
    if (used) {
      showAlert('Category in use', 'Move or delete the transactions in this category first.');
      return;
    }
    confirmAction({
      title: `Delete “${category.name}”?`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await deleteCategory(getDb(), category.id);
        await useData.getState().reload();
        onClose();
      },
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={category ? 'Edit category' : `New ${type} category`}>
      <View style={styles.row}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="Category name"
          placeholderTextColor={C.text3}
          style={styles.input}
          maxLength={LIMITS.name}
          autoFocus={!category}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Pressable style={styles.round} onPress={() => setPicker('emoji')} accessibilityLabel="Choose icon">
          <T style={{ fontSize: 22 }}>{icon}</T>
        </Pressable>
        <Pressable style={styles.round} onPress={() => setPicker('color')} accessibilityLabel="Choose colour">
          {/* Keyed by colour: Android loses a view's rounded corners when its background colour
              changes after mount, so a new colour gets a fresh view. */}
          <View key={color} style={[styles.dot, { backgroundColor: color }]} />
        </Pressable>
      </View>
      <View style={{ marginTop: 18 }}>
        <GradientButton label={category ? 'Save' : 'Add'} onPress={save} variant="light" height={52} />
      </View>
      {category ? (
        <Pressable onPress={remove} style={{ alignSelf: 'center', padding: 14 }} accessibilityRole="button" accessibilityLabel="Delete category">
          <T variant="body" tone="red">
            Delete category
          </T>
        </Pressable>
      ) : null}
      <EmojiSheet visible={picker === 'emoji'} onClose={() => setPicker(null)} onSelect={setIcon} />
      <ColorSheet visible={picker === 'color'} onClose={() => setPicker(null)} value={color} onSelect={setColor} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: C.text,
    paddingHorizontal: 18,
    fontSize: 17,
    fontFamily: F.regular, outlineWidth: 0,
  },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13 },
});
