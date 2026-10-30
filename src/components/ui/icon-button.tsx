import { StyleSheet } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { PressableScale } from '@/components/ui/pressable-scale';

interface IconButtonProps {
  onPress?: () => void;
  size?: number;
  children: React.ReactNode;
  accessibilityLabel: string;
  solid?: string;
}

/** Round glass button used for settings, close, add and menu actions. */
export function IconButton({ onPress, size = 42, children, accessibilityLabel, solid }: IconButtonProps) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6}>
      {/* `solid` tints the button on every platform (e.g. the teal "repeat on" state). */}
      <Glass
        style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]}
        tint={solid ?? 'rgba(70,78,84,0.45)'}
        fill={solid ?? 'rgba(40,45,49,0.96)'}>
        {children}
      </Glass>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
