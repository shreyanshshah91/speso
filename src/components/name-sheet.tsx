import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/ui/gradient-button';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useOnOpen } from '@/hooks/use-on-open';
import { LIMITS } from '@/lib/validate';
import { C, F } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  value: string;
  suggestions: string[];
  onChange: (v: string) => void;
}

export function NameSheet({ visible, onClose, value, suggestions, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  useOnOpen(visible, () => setDraft(value));

  const done = (v = draft) => {
    onChange(v.trim());
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Name">
      <TextField
        value={draft}
        onChangeText={setDraft}
        placeholder="e.g. Uber to home"
        placeholderTextColor={C.text3}
        style={styles.input}
        autoFocus
        maxLength={LIMITS.note}
        returnKeyType="done"
        onSubmitEditing={() => done()}
      />
      {suggestions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always">
          {suggestions.map((s) => (
            <Pressable key={s} style={styles.chip} onPress={() => done(s)}>
              <T variant="small" numberOfLines={1}>
                {s}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={{ marginTop: 14 }}>
        <GradientButton label="Done" onPress={() => done()} variant="light" height={52} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
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
  chips: { gap: 8, paddingTop: 12 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: C.pill, maxWidth: 220 },
});
