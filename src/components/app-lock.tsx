import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/ui/gradient-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { usePrefs } from '@/store/prefs';

export const appLockSupported = Platform.OS !== 'web';

/** Returns true when the device has biometrics or a passcode the lock can rely on. */
export async function canUseAppLock(): Promise<boolean> {
  if (!appLockSupported) return false;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

export async function authenticate(prompt = 'Unlock your ledger'): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel' });
  return res.success;
}

/**
 * Privacy + security wrapper:
 * - When "App lock" is on, content stays hidden behind a lock screen until biometric / passcode
 *   authentication succeeds, and re-locks whenever the app goes to the background.
 * - Whenever the app is not active, a cover is drawn so balances never appear in the app switcher.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const enabled = usePrefs((s) => s.appLock) && appLockSupported;
  const [locked, setLocked] = useState(enabled);
  const [covered, setCovered] = useState(false);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      if (await authenticate()) setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled && locked) unlock();
    // Only on mount / when the setting flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // The biometric prompt itself makes the app "inactive" on iOS; ignore that transition.
      if (authenticating.current) return;
      setCovered(state !== 'active');
      if (state === 'background' && enabled) setLocked(true);
      if (state === 'active' && enabled && locked) unlock();
    });
    return () => sub.remove();
  }, [enabled, locked, unlock]);

  if (enabled && locked) {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={styles.lockCircle}>
            <Lock size={34} color="#fff" />
          </View>
          <T variant="heading" center>
            Ledger locked
          </T>
          <T variant="body" tone="secondary" center style={{ marginTop: 8 }}>
            Authenticate to view your finances.
          </T>
          <View style={{ alignSelf: 'stretch', marginTop: 32 }}>
            <GradientButton label="Unlock" onPress={unlock} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      {children}
      {covered ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Screen>
            <View style={styles.center}>
              <View style={styles.lockCircle}>
                <Lock size={34} color="#fff" />
              </View>
            </View>
          </Screen>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  lockCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
});
