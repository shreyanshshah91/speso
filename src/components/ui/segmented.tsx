import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { C, R } from '@/theme';

interface SegmentedProps<V extends string> {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  /** Span the full width, with the segments sharing it equally (same inset at both ends). */
  fill?: boolean;
}

export function Segmented<V extends string>({ options, value, onChange, fill }: SegmentedProps<V>) {
  return (
    <View style={[styles.wrap, fill && styles.wrapFill]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(o.value);
            }}
            style={[styles.seg, fill && styles.segFill, active && styles.segActive]}>
            <T variant="body" tone={active ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: C.pill,
    borderRadius: R.pill,
    padding: 3,
  },
  wrapFill: { alignSelf: 'stretch' },
  seg: { paddingHorizontal: 18, height: 36, borderRadius: R.pill, justifyContent: 'center' },
  segFill: { flex: 1, paddingHorizontal: 4, alignItems: 'center' },
  segActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
