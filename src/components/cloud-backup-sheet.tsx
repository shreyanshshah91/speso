import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/ui/gradient-button';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { APP_NAME } from '@/constants/app';
import { useOnOpen } from '@/hooks/use-on-open';
import {
  CLOUD_NAME,
  MIN_PASSWORD,
  enableCloudBackup,
  restoreBackupFile,
  restoreCloudBackup,
  type EncryptedBackup,
} from '@/lib/cloud-backup';
import { errorMessage } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { C, F } from '@/theme';

/** `restoreFile` opens a password-protected backup file picked from Drive (saved by earlier versions). */
export type CloudBackupSheetMode = 'enable' | 'change' | 'restore' | 'restoreFile';

interface Props {
  mode: CloudBackupSheetMode | null;
  /** The picked file, for `restoreFile`. */
  file?: EncryptedBackup | null;
  onClose: () => void;
  onDone: (mode: CloudBackupSheetMode) => void;
}

const COPY: Record<CloudBackupSheetMode, { title: string; subtitle: string; action: string }> = {
  enable: {
    title: 'Backup password',
    subtitle: `Your backup is encrypted with this password before ${CLOUD_NAME} backup copies it. You'll need it to restore on a new or reset phone. ${APP_NAME} can't recover it if you forget it.`,
    action: 'Turn on backup',
  },
  change: {
    title: 'Change backup password',
    subtitle: 'The next backup is encrypted with the new password. Older backups need the old one.',
    action: 'Save password',
  },
  restore: {
    title: 'Restore backup',
    subtitle: 'Enter the password you chose when you turned on backup. Your current data will be replaced.',
    action: 'Restore',
  },
  restoreFile: {
    title: 'Restore backup',
    subtitle: 'Enter the password this backup was saved with. Your current data is kept as a snapshot, then replaced.',
    action: 'Restore',
  },
};

/** Password entry for turning on, re-keying or restoring the automatic cloud backup. */
export function CloudBackupSheet({ mode, file, onClose, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = mode !== null;
  useOnOpen(visible, () => {
    setPassword('');
    setConfirm('');
    setError(null);
  });

  const copy = COPY[mode ?? 'enable'];
  const needsConfirm = mode === 'enable' || mode === 'change';
  const restoring = mode === 'restore' || mode === 'restoreFile';
  const subtitle =
    mode === 'restoreFile' && file
      ? `Backup from ${format(parseISO(file.info.createdAt), 'd MMM yyyy')} with ${file.info.transactions} ${file.info.transactions === 1 ? 'transaction' : 'transactions'}. ${copy.subtitle}`
      : copy.subtitle;

  const submit = async () => {
    if (!mode || busy) return;
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (needsConfirm && password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      if (mode === 'restore') await restoreCloudBackup(password);
      else if (mode === 'restoreFile') {
        if (!file) throw new Error('Pick a backup file first.');
        await restoreBackupFile(file, password);
      } else await enableCloudBackup(password);
      haptic.success();
      onDone(mode);
      onClose();
    } catch (e) {
      haptic.warn();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={copy.title} subtitle={subtitle}>
      <TextField
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={C.text3}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={restoring ? 'password' : 'newPassword'}
        style={styles.input}
        editable={!busy}
        autoFocus
        maxLength={128}
        returnKeyType={needsConfirm ? 'next' : 'done'}
        onSubmitEditing={needsConfirm ? undefined : submit}
        accessibilityLabel="Backup password"
      />
      {needsConfirm ? (
        <TextField
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repeat password"
          placeholderTextColor={C.text3}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          style={[styles.input, { marginTop: 10 }]}
          editable={!busy}
          maxLength={128}
          returnKeyType="done"
          onSubmitEditing={submit}
          accessibilityLabel="Repeat backup password"
        />
      ) : null}
      <View style={styles.status}>
        {error ? (
          <T variant="small" tone="red" center>
            {error}
          </T>
        ) : busy ? (
          <T variant="small" tone="secondary" center>
            {restoring ? 'Unlocking your backup…' : 'Securing your backup…'}
          </T>
        ) : null}
      </View>
      <GradientButton label={busy ? 'Please wait…' : copy.action} onPress={submit} disabled={busy} variant="light" height={52} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: C.text,
    paddingHorizontal: 18,
    fontSize: 17,
    fontFamily: F.regular,
    outlineWidth: 0,
  },
  status: { minHeight: 36, justifyContent: 'center', paddingVertical: 8 },
});
