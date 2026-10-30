import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { T } from '@/components/ui/text';
import { C, R } from '@/theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'teal' | 'light';
  disabled?: boolean;
  height?: number;
}

/** Primary call-to-action: a teal gradient pill with a subtle darker "lip" underneath, or a light
 * variant used for confirm buttons inside sheets. */
export function GradientButton({ label, onPress, variant = 'teal', disabled, height = 54 }: Props) {
  const colors = variant === 'teal' ? ([C.tealStart, C.tealEnd] as const) : (['#F4F5F6', '#D8DADC'] as const);
  const lip = variant === 'teal' ? '#0A5360' : '#9EA3A7';
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.98}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <View style={[styles.lip, { backgroundColor: lip, height: height + 3 }]}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.btn, { height }]}>
          <T variant="bodyMedium" tone={variant === 'teal' ? 'primary' : 'dark'}>
            {label}
          </T>
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  lip: { borderRadius: R.pill },
  btn: { borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
});
