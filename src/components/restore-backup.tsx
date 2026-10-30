import { format, parseISO } from 'date-fns';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/ui/gradient-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useKeyboardPadding } from '@/hooks/keyboard';
import { CLOUD_NAME, MIN_PASSWORD, restoreCloudBackup, useRestoreOffer, type CloudBackupInfo } from '@/lib/cloud-backup';
import { confirmAction, errorMessage } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { C, F } from '@/theme';

/**
 * First launch after a reinstall or on a new phone, when the system backup brought back an
 * encrypted backup: offer to restore it with the backup password, or start fresh.
 */
export function RestoreBackup({ info }: { info: CloudBackupInfo }) {
  const insets = useSafeAreaInsets();
  const setInfo = useRestoreOffer((s) => s.setInfo);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liftStyle = useKeyboardPadding(Math.max(insets.bottom, 16));

  let when = '';
  try {
    when = format(parseISO(info.createdAt), "d MMM yyyy 'at' HH:mm");
  } catch {
    when = 'an earlier date';
  }

  const restore = async () => {
    if (busy) return;
    if (password.length < MIN_PASSWORD) return setError('Enter your backup password.');
    setBusy(true);
    setError(null);
    try {
      await restoreCloudBackup(password);
      haptic.success();
      setInfo(null);
    } catch (e) {
      haptic.warn();
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const startFresh = () =>
    confirmAction({
      title: 'Start fresh?',
      message: `Your ${CLOUD_NAME} backup stays where it is for now, but if you turn backup on again later it will be replaced by your new data.`,
      confirmLabel: 'Start fresh',
      destructive: false,
      onConfirm: () => setInfo(null),
    });

  return (
    <Screen tint="teal">
      <Animated.View style={[styles.wrap, liftStyle]}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <ShieldCheck size={34} color={C.tealText} />
          </View>
          <T variant="title" center style={{ marginTop: 18 }}>
            Welcome back
          </T>
          <T variant="body" tone="secondary" center style={styles.sub}>
            We found your encrypted {CLOUD_NAME} backup from {when}
            {info.transactions > 0 ? ` with ${info.transactions} transaction${info.transactions === 1 ? '' : 's'}` : ''}. Enter your
            backup password to restore it.
          </T>
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder="Backup password"
            placeholderTextColor={C.text3}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            editable={!busy}
            maxLength={128}
            returnKeyType="done"
            onSubmitEditing={restore}
            style={styles.input}
            accessibilityLabel="Backup password"
          />
          <View style={styles.status}>
            {error ? (
              <T variant="small" tone="red" center>
                {error}
              </T>
            ) : busy ? (
              <T variant="small" tone="secondary" center>
                Unlocking your backup…
              </T>
            ) : null}
          </View>
        </View>
        <GradientButton label={busy ? 'Please wait…' : 'Restore my data'} onPress={restore} disabled={busy} />
        <Pressable onPress={startFresh} disabled={busy} style={styles.fresh} accessibilityRole="button" accessibilityLabel="Start fresh instead">
          <T variant="body" tone="secondary">
            Start fresh instead
          </T>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: 'center' },
  badge: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(20,196,162,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub: { marginTop: 10, paddingHorizontal: 6 },
  input: {
    marginTop: 26,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: C.text,
    paddingHorizontal: 20,
    fontSize: 17,
    fontFamily: F.regular,
    outlineWidth: 0,
  },
  status: { minHeight: 40, justifyContent: 'center', paddingTop: 8 },
  fresh: { alignSelf: 'center', paddingVertical: 16, paddingHorizontal: 20 },
});
