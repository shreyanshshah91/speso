import { Alert, Platform } from 'react-native';

import { useDialogStore } from '@/store/dialog';

/**
 * In-app dialogs (styled cards rendered by the top-most SheetHost). Falls back to the system
 * dialog only if no host is mounted yet.
 */

function hasHost() {
  return useDialogStore.getState().hosts.length > 0;
}

export function showAlert(title: string, message?: string) {
  if (hasHost()) {
    useDialogStore.getState().open({ title, message, kind: 'alert', confirmLabel: 'OK', destructive: false });
    return;
  }
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function confirmAction({ title, message, confirmLabel, destructive = true, onConfirm }: ConfirmOptions) {
  const run = () => {
    Promise.resolve(onConfirm()).catch((e) => showAlert('Something went wrong', errorMessage(e)));
  };
  if (hasHost()) {
    useDialogStore.getState().open({ title, message, kind: 'confirm', confirmLabel, destructive, onConfirm: run });
    return;
  }
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: run },
  ]);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
