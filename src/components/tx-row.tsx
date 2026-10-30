import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { T } from '@/components/ui/text';
import { C, R } from '@/theme';

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  amount: string;
  amountTone?: 'primary' | 'green' | 'secondary';
  first: boolean;
  last: boolean;
  recurring?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

/** One row of a day group in Activity; groups render as a single rounded card. */
export const TxRow = memo(function TxRow({ icon, title, subtitle, amount, amountTone = 'primary', first, last, recurring, onPress, onLongPress }: Props) {
  return (
    <View style={styles.outer}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${amount}`}
        style={({ pressed }) => [
          styles.row,
          first && styles.first,
          last && styles.last,
          pressed && { backgroundColor: 'rgba(255,255,255,0.1)' },
        ]}>
        <CategoryIcon icon={icon} size={37} />
        <View style={{ flex: 1 }}>
          <T variant="body" numberOfLines={1} style={styles.title}>
            {title}
          </T>
          {subtitle || recurring ? (
            <T variant="caption" tone="secondary" numberOfLines={1}>
              {recurring ? '↻ ' : ''}
              {subtitle}
            </T>
          ) : null}
        </View>
        <T variant="body" tone={amountTone} style={styles.amount}>
          {amount}
        </T>
      </Pressable>
      {!last ? <View style={styles.divider} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { marginHorizontal: 16 },
  title: { fontSize: 16, lineHeight: 21 },
  amount: { fontSize: 16, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 11,
    height: 57,
    backgroundColor: C.card,
  },
  first: { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },
  last: { borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.divider, position: 'absolute', left: 0, right: 0, bottom: 0 },
});
