import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { confirmAction } from '@/lib/dialog';

/** How often to look for a cloud update when the app comes back to the front. */
const RECHECK_MS = 10 * 60 * 1000;

/**
 * Cloud (EAS) updates. expo-updates checks on every cold start and downloads in the background,
 * but only switches to the new version on the next cold start, which is easy to miss. This also
 * checks whenever the app returns to the front, and once an update has downloaded, offers to
 * restart into it.
 */
export function UpdatePrompt() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const lastCheck = useRef(0);
  const offered = useRef<string | null>(null);

  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    // expo-updates has just checked on launch.
    lastCheck.current = Date.now();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < RECHECK_MS) return;
      lastCheck.current = Date.now();
      Updates.checkForUpdateAsync()
        .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : null))
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isUpdatePending) return;
    const id = downloadedUpdate?.updateId ?? 'pending';
    if (offered.current === id) return;
    offered.current = id;
    confirmAction({
      title: `${APP_NAME} has been updated`,
      message: 'Restart now to use the latest version. Anything you haven’t saved yet will be cleared.',
      confirmLabel: 'Restart',
      destructive: false,
      onConfirm: () => Updates.reloadAsync(),
    });
  }, [isUpdatePending, downloadedUpdate]);

  return null;
}
