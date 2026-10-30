import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { C } from '@/theme';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

const W = 52;
const H = 32;
const KNOB = 26;

export function Toggle({ value, onChange, accessibilityLabel, disabled }: ToggleProps) {
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(value ? 1 : 0, { duration: 180 }));
  }, [value, p]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], ['rgba(255,255,255,0.14)', C.green]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + p.get() * (W - KNOB - 6) }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, justifyContent: 'center' },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
