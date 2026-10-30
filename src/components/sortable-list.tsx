import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

export interface SortableItem {
  key: string;
  /** Render the row; wrap the drag handle in the provided component. */
  render: (Handle: React.ComponentType<{ children: React.ReactNode }>) => React.ReactNode;
}

interface Props {
  items: SortableItem[];
  itemHeight: number;
  onReorder: (keys: string[]) => void;
}

function toPositions(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  keys.forEach((k, i) => (out[k] = i));
  return out;
}

/** Fixed-row-height list whose rows can be dragged into a new order by their handle. */
export function SortableList({ items, itemHeight, onReorder }: Props) {
  const keys = items.map((i) => i.key);
  const positions = useSharedValue(toPositions(keys));
  const joined = keys.join('|');

  useEffect(() => {
    positions.set(toPositions(joined ? joined.split('|') : []));
  }, [joined, positions]);

  return (
    <View style={{ height: items.length * itemHeight }}>
      {items.map((item) => (
        <Row key={item.key} id={item.key} positions={positions} itemHeight={itemHeight} count={items.length} onReorder={onReorder}>
          {item.render}
        </Row>
      ))}
    </View>
  );
}

interface RowProps {
  id: string;
  positions: SharedValue<Record<string, number>>;
  itemHeight: number;
  count: number;
  onReorder: (keys: string[]) => void;
  children: SortableItem['render'];
}

function Row({ id, positions, itemHeight, count, onReorder, children }: RowProps) {
  const top = useSharedValue((positions.get()[id] ?? 0) * itemHeight);
  const active = useSharedValue(false);
  const startTop = useSharedValue(0);

  useAnimatedReaction(
    () => positions.get()[id],
    (pos, prev) => {
      if (pos !== prev && !active.get() && pos !== undefined) top.set(withSpring(pos * itemHeight, { damping: 22, stiffness: 260 }));
    }
  );

  const finish = () => {
    const entries = Object.entries(positions.get()).sort((a, b) => a[1] - b[1]);
    onReorder(entries.map((e) => e[0]));
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      active.set(true);
      startTop.set(top.get());
      runOnJS(haptic.tap)();
    })
    .onUpdate((e) => {
      const y = startTop.get() + e.translationY;
      top.set(y);
      const current = positions.get();
      const newPos = Math.max(0, Math.min(count - 1, Math.round(y / itemHeight)));
      const oldPos = current[id];
      if (newPos !== oldPos) {
        const next = { ...current };
        for (const k of Object.keys(next)) {
          if (next[k] === newPos) next[k] = oldPos;
        }
        next[id] = newPos;
        positions.set(next);
        runOnJS(haptic.select)();
      }
    })
    .onFinalize(() => {
      if (!active.get()) return;
      active.set(false);
      top.set(withTiming((positions.get()[id] ?? 0) * itemHeight, { duration: 180 }));
      runOnJS(finish)();
    });

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    height: itemHeight,
    top: top.get(),
    zIndex: active.get() ? 10 : 0,
    transform: [{ scale: withTiming(active.get() ? 1.03 : 1, { duration: 150 }) }],
    shadowOpacity: active.get() ? 0.35 : 0,
    shadowRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
  }));

  const Handle = ({ children: c }: { children: React.ReactNode }) => (
    <GestureDetector gesture={pan}>
      <View hitSlop={10}>{c}</View>
    </GestureDetector>
  );

  return <Animated.View style={style}>{children(Handle)}</Animated.View>;
}
