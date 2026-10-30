import { CircleAlert, Trash2 } from 'lucide-react-native';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions, Platform } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { T } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { useDialogStore, type DialogRequest } from '@/store/dialog';
import { C } from '@/theme';

/** Renders the front-most queued dialog as an in-app card (used by showAlert / confirmAction). */
export function DialogLayer() {
  const current = useDialogStore((s) => s.queue[0]);
  if (!current) return null;
  return <DialogCard key={current.id} req={current} />;
}

function DialogCard({ req }: { req: DialogRequest }) {
  const close = useDialogStore((s) => s.close);
  const { width } = useWindowDimensions();
  const cancel = () => close(req.id);
  const confirm = () => {
    haptic.tap();
    close(req.id);
    req.onConfirm?.();
  };

  useEffect(() => {
    if (req.kind === 'confirm' && req.destructive) haptic.warn();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close(req.id);
      return true;
    });
    return () => sub.remove();
  }, [req, close]);

  // One eased timing drives both layers: the backdrop fades in while the card settles from 94% to
  // full size. (A spring-based zoom overshoots on Android and reads as a jump.)
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [shown]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: 0.94 + 0.06 * shown.get() }] }));

  const Icon = req.destructive ? Trash2 : CircleAlert;
  return (
    <Animated.View exiting={FadeOut.duration(140)} style={[styles.backdrop, backdropStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={req.kind === 'alert' ? confirm : cancel} accessibilityLabel="Dismiss" />
      <Animated.View
        style={[styles.card, { width: Math.min(340, width - 48) }, cardStyle]}
        accessibilityViewIsModal
        accessibilityRole="alert">
        <View style={[styles.iconCircle, req.destructive && styles.iconDanger]}>
          <Icon size={24} color={req.destructive ? C.red : C.tealText} />
        </View>
        <T variant="heading" center style={{ marginTop: 14 }}>
          {req.title}
        </T>
        {req.message ? (
          <T variant="body" tone="secondary" center style={styles.message}>
            {req.message}
          </T>
        ) : null}
        <View style={styles.buttons}>
          {req.kind === 'confirm' ? (
            <PressableScale onPress={cancel} style={[styles.button, styles.cancel]} accessibilityRole="button" accessibilityLabel="Cancel">
              <T variant="bodyMedium" style={styles.cancelLabel} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
                Cancel
              </T>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={confirm}
            style={[styles.button, req.destructive ? styles.danger : styles.primary]}
            accessibilityRole="button"
            accessibilityLabel={req.confirmLabel}>
            {/* Explicit colours so the label can't blend into its button on any theme. */}
            <T
              variant="bodyMedium"
              style={req.destructive ? styles.dangerLabel : styles.primaryLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.2}>
              {req.confirmLabel || 'OK'}
            </T>
          </PressableScale>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { zIndex: 2000 } : { elevation: 2000 }),
  },
  card: {
    backgroundColor: C.sheet,
    borderRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(20,196,162,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: 'rgba(240,97,109,0.14)' },
  message: { marginTop: 8, fontSize: 16, lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  button: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cancel: { backgroundColor: 'rgba(255,255,255,0.09)' },
  danger: { backgroundColor: '#E5484D' },
  primary: { backgroundColor: '#E9EBEC' },
  cancelLabel: { color: '#FFFFFF' },
  dangerLabel: { color: '#FFFFFF' },
  primaryLabel: { color: '#111416' },
});
