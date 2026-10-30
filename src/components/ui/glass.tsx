import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { C } from '@/theme';

interface GlassProps {
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Overlay colour laid over the blur to set the glass tint (iOS). */
  tint?: string;
  /** Solid-ish fill used instead of the blur on Android and web. */
  fill?: string;
  border?: boolean;
  children?: React.ReactNode;
}

/**
 * Frosted glass surface. iOS gets a real backdrop blur; Android and web get an equivalent
 * translucent fill (Android blur needs a registered blur target and is costly while scrolling).
 */
export function Glass({ style, intensity = 30, tint = 'rgba(40,46,50,0.55)', fill = 'rgba(34,39,43,0.95)', border = true, children }: GlassProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const radius = flat.borderRadius;
  return (
    <View style={[styles.clip, style]}>
      {Platform.OS === 'ios' ? (
        <>
          <BlurView tint="dark" intensity={intensity} style={[StyleSheet.absoluteFill, styles.under]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: tint }]} />
        </>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: fill }]} />
      )}
      {border ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // On web, positioned fill layers would paint over non-positioned children (e.g. SVG icons), so
  // they're pushed back. Native draws children in order already, and Android's zIndex drawing
  // order can go stale when siblings change, hiding content — so it's web only.
  under: Platform.OS === 'web' ? { zIndex: -1 } : {},
});
