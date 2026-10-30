import { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

/**
 * Animated bottom padding that follows the software keyboard: `base` while it's closed, and the
 * keyboard height plus `gap` while it's open. Android runs edge-to-edge, so the window no longer
 * resizes for the keyboard on its own; screens with inputs apply this instead.
 */
export function useKeyboardPadding(base: number, gap = 12) {
  const { height } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => {
    const kb = -height.get();
    return { paddingBottom: kb > 0 ? Math.max(base, kb + gap) : base };
  });
}

/** Animated height equal to the open keyboard (0 when closed), for list footers. */
export function useKeyboardSpacer() {
  const { height } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({ height: Math.max(0, -height.get()) }));
}
