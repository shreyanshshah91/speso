import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';

export interface Option<V> {
  value: V;
  label: string;
  icon?: string;
  detail?: string;
}

interface Props<V> {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: Option<V>[];
  value: V;
  onSelect: (v: V) => void;
  /** Marks one option with a "Default" badge. */
  defaultValue?: V;
  /** When set, the chosen row offers "Make it default" (unless it already is the default). */
  onMakeDefault?: (v: V) => void;
  /** Options that keep the sheet open when chosen (e.g. "Custom" reveals extra fields). */
  keepOpen?: (v: V) => boolean;
  /** Extra content under the list (e.g. From / To fields). */
  footer?: React.ReactNode;
}

/** Single-choice list of rounded, outlined rows; the chosen row is highlighted with a white ring. */
export function OptionsSheet<V extends string | number | null>({
  visible,
  onClose,
  title,
  subtitle,
  options,
  value,
  onSelect,
  defaultValue,
  onMakeDefault,
  keepOpen,
  footer,
}: Props<V>) {
  const scrollRef = useRef<ScrollView>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: 520 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        // Reveal extra fields (e.g. Custom's From / To) as soon as they appear.
        onContentSizeChange={() => footer && scrollRef.current?.scrollToEnd({ animated: true })}>
        {options.map((o) => (
          <ChoiceRow
            key={String(o.value)}
            label={o.label}
            icon={o.icon}
            detail={o.detail}
            selected={o.value === value}
            isDefault={defaultValue !== undefined && o.value === defaultValue}
            onMakeDefault={
              onMakeDefault && o.value === value && o.value !== defaultValue
                ? () => {
                    haptic.success();
                    onMakeDefault(o.value);
                  }
                : undefined
            }
            onPress={() => {
              haptic.select();
              onSelect(o.value);
              if (!keepOpen?.(o.value)) onClose();
            }}
          />
        ))}
        {footer}
      </ScrollView>
    </Sheet>
  );
}

interface ChoiceRowProps {
  label: string;
  icon?: string;
  detail?: string;
  selected?: boolean;
  isDefault?: boolean;
  dim?: boolean;
  onPress: () => void;
  /** Shows a "Make it default" button on the row. */
  onMakeDefault?: () => void;
}

export function ChoiceRow({ label, icon, detail, selected, isDefault, dim, onPress, onMakeDefault }: ChoiceRowProps) {
  const main = (
    <>
      {icon ? <T style={styles.icon}>{icon}</T> : null}
      <T variant="body" tone={dim ? 'tertiary' : 'primary'} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </T>
      {detail ? (
        <T variant="body" tone="secondary" numberOfLines={1}>
          {detail}
        </T>
      ) : null}
      {isDefault ? (
        <View style={styles.badge}>
          <T variant="small" tone="secondary">
            Default
          </T>
        </View>
      ) : null}
    </>
  );

  // "Make it default" is its own button beside the row's main button (buttons can't nest).
  if (onMakeDefault && !isDefault) {
    return (
      <View style={[styles.row, styles.split, selected && styles.rowSelected]}>
        <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={styles.splitMain}>
          {main}
        </PressableScale>
        <Pressable
          onPress={onMakeDefault}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Make ${label} the default`}
          style={({ pressed }) => [styles.makeDefault, pressed && { opacity: 0.7 }]}>
          <T variant="small">Make it default</T>
        </Pressable>
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.rowSelected]}>
      {main}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  rowSelected: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  icon: { fontSize: 20 },
  badge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  split: { paddingLeft: 0, paddingRight: 12 },
  splitMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', paddingLeft: 18 },
  makeDefault: { backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
});
