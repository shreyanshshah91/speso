import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { C, R } from '@/theme';

interface PillProps {
  label?: string;
  icon?: React.ReactNode;
  /** Differs from its default: drawn with a white ring. */
  active?: boolean;
  /** With `active`, shows a clear (ⓧ) button that resets the filter to its default. */
  onClear?: () => void;
  onPress?: () => void;
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
}

export function Pill({ label, icon, active, onClear, onPress, size = 'lg', accessibilityLabel }: PillProps) {
  const h = size === 'lg' ? 38 : 32;
  const padX = label ? (size === 'lg' ? 16 : 12) : 0;
  const text = label ? (
    <T variant={size === 'lg' ? 'body' : 'small'} numberOfLines={1} style={size === 'lg' ? { fontSize: 16 } : undefined}>
      {label}
    </T>
  ) : null;

  // With a clear button the pill is a container holding two sibling buttons (a button may not
  // contain another button), sharing the white ring.
  if (active && onClear && label) {
    return (
      <View style={[styles.pill, styles.active, styles.split, { height: h }]}>
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} style={[styles.row, { paddingLeft: padX, paddingRight: 6, height: '100%' }]}>
          {icon}
          {text}
        </PressableScale>
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} style={styles.clear}>
          <X size={11} color="#1B2024" strokeWidth={3.4} />
        </Pressable>
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, { height: h, paddingHorizontal: padX, width: label ? undefined : h }, active && styles.active]}>
      <View style={styles.row}>
        {icon}
        {text}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: C.pill,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  active: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.05)' },
  split: { flexDirection: 'row', paddingRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(235,238,240,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
