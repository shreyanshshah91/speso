import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui/text';
import { C } from '@/theme';

interface Props {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

export function SettingsRow({ icon, label, value, badge, onPress, right, destructive }: Props) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}>
      <View style={styles.iconBox}>{icon}</View>
      <View style={styles.labelWrap}>
        <T variant="body" tone={destructive ? 'red' : 'primary'} numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </T>
        {badge ? (
          <View style={styles.badge}>
            <T variant="caption" tone="teal" weight="medium">
              {badge}
            </T>
          </View>
        ) : null}
      </View>
      {right ?? (
        <View style={styles.valueWrap}>
          {value ? (
            <T variant="body" tone="secondary" numberOfLines={1}>
              {value}
            </T>
          ) : null}
          {onPress ? <ChevronRight size={20} color={C.text3} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 12, gap: 14 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { backgroundColor: 'rgba(20,196,162,0.14)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '50%' },
});
