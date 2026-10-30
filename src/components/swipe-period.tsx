import { useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { isShiftable } from '@/lib/period';
import { filterActions, useFilters, type FilterScope } from '@/store/prefs';

const OUT = { duration: 120, easing: Easing.in(Easing.quad) };
const IN = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * Horizontal swipe between steps: left goes forward (+1), right goes back (-1).
 *
 * The content follows the finger, slides out on release, and the new content is swapped in while
 * it's invisible, then slides in from the side it came from. The swap waits until after React has
 * committed the new content, so the (sometimes heavy) re-render never shows as a stutter.
 */
export function SwipeSteps({
  onStep,
  canStep,
  enabled = true,
  children,
}: {
  onStep: (dir: 1 | -1) => void;
  canStep: (dir: 1 | -1) => boolean;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const fade = useSharedValue(1);
  const [swap, setSwap] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });

  // Runs after the new content has been committed: bring it in from the swipe's side.
  useEffect(() => {
    if (swap.n === 0) return;
    x.set(withSequence(withTiming(swap.dir * 36, { duration: 0 }), withTiming(0, IN)));
    fade.set(withTiming(1, IN));
  }, [swap, x, fade]);

  const commit = (dir: 1 | -1) => {
    haptic.select();
    onStep(dir);
    setSwap((s) => ({ n: s.n + 1, dir }));
  };

  const release = (dir: 1 | -1) => {
    if (!canStep(dir)) {
      x.set(withTiming(0, { duration: 180 }));
      return;
    }
    // Slide the old content out on the UI thread, then swap.
    fade.set(withTiming(0, OUT));
    x.set(
      withTiming(-dir * 48, OUT, (finished) => {
        if (finished) runOnJS(commit)(dir);
      })
    );
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      x.set(e.translationX * 0.4);
    })
    .onEnd((e) => {
      if (e.translationX < -45 || e.velocityX < -500) runOnJS(release)(1);
      else if (e.translationX > 45 || e.velocityX > 500) runOnJS(release)(-1);
      else x.set(withTiming(0, { duration: 180 }));
    });

  const style = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View collapsable={false} style={style}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** Swipe left for the next (newer) period, right for the previous one. */
export function SwipePeriod({ scope, children }: { scope: FilterScope; children: React.ReactNode }) {
  const { period: kind, offset } = useFilters(scope);
  const { setOffset } = filterActions(scope);
  return (
    <SwipeSteps enabled={isShiftable(kind)} canStep={(dir) => offset + dir <= 0} onStep={(dir) => setOffset(offset + dir)}>
      {children}
    </SwipeSteps>
  );
}
