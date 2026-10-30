import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetHost } from '@/components/ui/sheet-host';
import { T } from '@/components/ui/text';
import { C } from '@/theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Rendered right-aligned in the title row (e.g. an edit button). */
  headerRight?: React.ReactNode;
  headerLeft?: React.ReactNode;
  /** Replaces the title with custom content (e.g. a segmented control). */
  headerCenter?: React.ReactNode;
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Fill most of the screen height (for long lists). */
  tall?: boolean;
  /** Fill nearly the whole screen, like a full-page sheet (e.g. Edit account). */
  full?: boolean;
}

const OFFSCREEN = 900;
const CLOSE_MS = 240;

/**
 * Bottom sheet with a grabber, dimmed backdrop, slide animation and swipe-down-to-dismiss.
 * Rendered into the nearest <SheetHost> (falls back to a Modal when there is none).
 */
export function Sheet(props: SheetProps) {
  const { visible } = props;
  const host = useSheetHost();
  const id = useId();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(OFFSCREEN);
  const fade = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      y.set(withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }));
      fade.set(withTiming(1, { duration: 250 }));
      return;
    }
    fade.set(withTiming(0, { duration: 200 }));
    y.set(withTiming(OFFSCREEN, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }));
    // Unmount on a timer rather than relying on the animation callback, which may never report
    // completion if the animation is interrupted — a lingering invisible layer would block taps.
    const t = setTimeout(() => setMounted(false), CLOSE_MS + 40);
    return () => clearTimeout(t);
  }, [visible, y, fade]);

  const layer = mounted ? <SheetLayer {...props} y={y} fade={fade} /> : null;

  // A layout effect, so the host shows this render's layer before the next touch or keystroke.
  // With a passive effect the host could lag a render behind: a tap could run a stale onPress
  // (saving text without its last letter), and inputs would get their `value` late.
  useLayoutEffect(() => {
    if (!host) return;
    if (layer) host.mount(id, layer);
    else host.unmount(id);
  });
  useEffect(() => () => host?.unmount(id), [host, id]);

  if (host || !layer) return null;
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={props.onClose}>
      <GestureHandlerRootView style={styles.flex}>{layer}</GestureHandlerRootView>
    </Modal>
  );
}

function SheetLayer({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  headerLeft,
  headerCenter,
  children,
  contentStyle,
  tall,
  full,
  y,
  fade,
}: SheetProps & { y: SharedValue<number>; fade: SharedValue<number> }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        y.set(withTiming(0, { duration: 200 }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  // Lift the sheet above the keyboard in step with it (Android is edge-to-edge, so the window no
  // longer resizes by itself). The sheet's own bottom padding already covers the safe area.
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomInset = insets.bottom;
  const liftStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -keyboard.height.get() - bottomInset) }));
  // Heights in points, tracking the keyboard: a sheet never grows past the space between the
  // status bar and the keyboard (percentages here were measured against the whole screen, which
  // pushed tall sheets like the emoji picker off the top while typing).
  const { height: winH } = useWindowDimensions();
  const topPad = insets.top + 8;
  const sizeStyle = useAnimatedStyle(() => {
    const lifted = Math.max(0, -keyboard.height.get() - bottomInset);
    const avail = Math.max(120, winH - topPad - lifted - 8);
    if (full) return { maxHeight: avail, minHeight: Math.min(winH * 0.9, avail) };
    return tall ? { maxHeight: Math.min(winH * 0.88, avail), minHeight: Math.min(winH * 0.7, avail) } : { maxHeight: avail };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.bottom, { paddingTop: topPad }, liftStyle]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8, marginHorizontal: 8, marginBottom: 8 },
            sizeStyle,
            sheetStyle,
          ]}>
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              {title || headerRight || headerLeft || headerCenter ? (
                <View style={styles.titleRow}>
                  <View style={styles.side}>{headerLeft}</View>
                  <View style={styles.titleCenter}>
                    {headerCenter ? (
                      <View style={{ alignItems: 'center' }}>{headerCenter}</View>
                    ) : title ? (
                      <T variant="heading" center>
                        {title}
                      </T>
                    ) : null}
                  </View>
                  <View style={[styles.side, { alignItems: 'flex-end' }]}>{headerRight}</View>
                </View>
              ) : null}
              {subtitle ? (
                <T variant="body" tone="secondary" center style={styles.subtitle}>
                  {subtitle}
                </T>
              ) : null}
            </View>
          </GestureDetector>
          <View style={[styles.content, styles.flexShrink, full && styles.flex, contentStyle]}>{children}</View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.sheet,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 32 },
  side: { width: 56 },
  titleCenter: { flex: 1 },
  subtitle: { marginTop: 6, paddingHorizontal: 12, fontSize: 16 },
  content: { paddingHorizontal: 16, paddingTop: 10 },
});
