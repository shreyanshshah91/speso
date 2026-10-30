import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { CloudUpload, HardDriveDownload, HardDriveUpload, History, KeyRound, RotateCcw, Share2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CloudBackupSheet, type CloudBackupSheetMode } from '@/components/cloud-backup-sheet';
import { ModalHeader } from '@/components/modal-header';
import { OptionsSheet } from '@/components/options-sheet';
import { Section } from '@/components/section';
import { SettingsRow } from '@/components/settings-row';
import { Screen } from '@/components/ui/screen';
import { Toggle } from '@/components/ui/toggle';
import { T } from '@/components/ui/text';
import { APP_NAME } from '@/constants/app';
import { getDb } from '@/db/client';
import { exportBackupAndShare, listSnapshots, restoreFromSnapshot, takeSnapshot, type SnapshotInfo } from '@/lib/backup';
import {
  CLOUD_NAME,
  canWriteCloudBackup,
  disableCloudBackup,
  backupSummary,
  enableCloudBackup,
  hasBackupPassword,
  isCloudBackupSupported,
  pickBackupFile,
  readCloudBackupInfo,
  restorePlainBackup,
  saveBackupToDrive,
  writeCloudBackup,
  type CloudBackupInfo,
  type EncryptedBackup,
  type PickedBackup,
} from '@/lib/cloud-backup';
import { confirmAction, errorMessage, showAlert } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C } from '@/theme';

export default function BackupsScreen() {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const cloudOn = usePrefs((s) => s.cloudBackup);
  const cloudAt = usePrefs((s) => s.cloudBackupAt);
  const [sheet, setSheet] = useState<CloudBackupSheetMode | null>(null);
  const [menu, setMenu] = useState(false);
  // The backup file on this device, and whether this device can keep writing it.
  const [fileInfo, setFileInfo] = useState<CloudBackupInfo | null>(null);
  const [hasKey, setHasKey] = useState(true);
  // A backup password is already set on this device (e.g. from turning backup on before).
  const [hasPassword, setHasPassword] = useState(false);
  const driveAt = usePrefs((s) => s.driveBackupAt);
  // A password-protected Drive copy from an earlier version, waiting for its password.
  const [picked, setPicked] = useState<EncryptedBackup | null>(null);

  const load = useCallback(() => {
    listSnapshots(getDb()).then(setSnapshots).catch(() => setSnapshots([]));
    Promise.resolve()
      .then(readCloudBackupInfo)
      .then(setFileInfo)
      .catch(() => setFileInfo(null));
    canWriteCloudBackup().then(setHasKey).catch(() => setHasKey(false));
    hasBackupPassword().then(setHasPassword).catch(() => setHasPassword(false));
  }, []);
  useEffect(load, [load]);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showAlert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exportNow = () =>
    guard(async () => {
      await exportBackupAndShare(getDb());
    });

  const restore = (s: SnapshotInfo) =>
    confirmAction({
      title: 'Restore this snapshot?',
      message: `All current data will be replaced with the snapshot from ${format(parseISO(s.createdAt), 'd MMM yyyy, HH:mm')}. A snapshot of your current data is taken first.`,
      confirmLabel: 'Restore',
      onConfirm: () =>
        guard(async () => {
          const db = getDb();
          await takeSnapshot(db);
          await restoreFromSnapshot(db, s.id);
          await usePrefs.getState().hydrate();
          await useData.getState().reload();
          haptic.success();
          showAlert('Restored', 'Your data has been restored from the snapshot.');
          load();
        }),
    });

  const toggleCloud = (on: boolean) => {
    if (on) {
      if (!hasPassword) return setSheet('enable');
      // A password is already set on this device: reuse it rather than asking for another.
      guard(async () => {
        await enableCloudBackup();
        load();
        haptic.success();
        showAlert(`${CLOUD_NAME} backup is on`, 'It uses the backup password you set before.');
      });
      return;
    }
    confirmAction({
      title: `Turn off ${CLOUD_NAME} backup?`,
      message: `The encrypted backup file is deleted from this phone, so ${CLOUD_NAME} backup stops keeping a copy of your data.`,
      confirmLabel: 'Turn off',
      onConfirm: () =>
        guard(async () => {
          await disableCloudBackup();
          load();
        }),
    });
  };

  const backUpNow = () =>
    guard(async () => {
      const ok = await writeCloudBackup(getDb());
      load();
      if (ok) {
        haptic.success();
        showAlert('Backup saved', `${CLOUD_NAME} backup will copy it off your phone the next time it runs.`);
      }
    });

  const saveToDrive = () =>
    guard(async () => {
      const result = await saveBackupToDrive(getDb());
      if (result === 'saved') {
        haptic.success();
        showAlert('Backup saved', 'Your backup file has been saved. The time of this backup now shows under Save to Google Drive.');
      }
    });

  const restoreFromDrive = () =>
    guard(async () => {
      let file: PickedBackup | null;
      try {
        file = await pickBackupFile();
      } catch (e) {
        showAlert('Can’t use this file', errorMessage(e));
        return;
      }
      if (!file) return;
      if (file.kind === 'encrypted') {
        setPicked(file);
        setSheet('restoreFile');
        return;
      }
      const { snapshot } = file;
      confirmAction({
        title: 'Restore this backup?',
        message: `${backupSummary(file.info)} Your current data is saved as a snapshot, then replaced.`,
        confirmLabel: 'Restore',
        onConfirm: () =>
          guard(async () => {
            await restorePlainBackup(snapshot, getDb());
            load();
            haptic.success();
            showAlert('Restored', 'Your data has been restored from the backup.');
          }),
      });
    });

  const cloudStatus = !cloudOn
    ? 'Off'
    : !hasKey
      ? 'Needs your password'
      : cloudAt
        ? `Saved ${formatDistanceToNowStrict(parseISO(cloudAt))} ago`
        : 'On';

  const cloudFooter =
    Platform.OS === 'ios'
      ? `${APP_NAME} keeps an encrypted copy of your data that goes into your iCloud device backup. After a reset or on a new iPhone, restore from iCloud, open ${APP_NAME} and enter your backup password.`
      : `${APP_NAME} keeps an encrypted copy of your data that Android's Google backup copies to your Google account, usually once a day on Wi-Fi while charging. Check that Settings → Google → Backup is on. After a reset or on a new phone, install ${APP_NAME} and enter your backup password to restore. ${APP_NAME} can't recover a forgotten password.`;

  const driveFooter =
    Platform.OS === 'android'
      ? `Saves a copy of your data to your Google Drive, no password needed: pick Drive on the Save screen (it opens there next time). Only backups you actually save are counted. On a new or reset phone, install ${APP_NAME} and choose Restore from Google Drive. The file isn't encrypted, so keep it in your own Drive.`
      : `Saves a copy of your data to Google Drive or Files, no password needed. On a new phone, install ${APP_NAME} and choose Restore from Google Drive. The file isn't encrypted, so keep it somewhere private.`;

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <ModalHeader title="Backup" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isCloudBackupSupported ? (
          <Section title={`${CLOUD_NAME} backup`} footer={cloudFooter}>
            <SettingsRow
              icon={<CloudUpload size={20} color={C.text2} />}
              label="Automatic backup"
              right={<Toggle value={cloudOn} onChange={toggleCloud} accessibilityLabel={`Automatic ${CLOUD_NAME} backup`} />}
            />
            {cloudOn ? (
              <SettingsRow
                icon={<KeyRound size={20} color={C.text2} />}
                label={hasKey ? 'Backup options' : 'Enter backup password'}
                value={cloudStatus}
                onPress={() => (hasKey ? setMenu(true) : setSheet('change'))}
              />
            ) : null}
            {fileInfo && (!cloudOn || !hasKey) ? (
              <SettingsRow
                icon={<RotateCcw size={20} color={C.text2} />}
                label="Restore from backup"
                value={format(parseISO(fileInfo.createdAt), 'd MMM yyyy')}
                onPress={() => setSheet('restore')}
              />
            ) : null}
          </Section>
        ) : null}

        {isCloudBackupSupported ? (
          <Section title="Google Drive" footer={driveFooter}>
            <SettingsRow
              icon={<HardDriveUpload size={20} color={C.text2} />}
              label="Save to Google Drive"
              value={driveAt ? `Saved ${formatDistanceToNowStrict(parseISO(driveAt))} ago` : 'Not saved yet'}
              onPress={saveToDrive}
            />
            <SettingsRow icon={<HardDriveDownload size={20} color={C.text2} />} label="Restore from Google Drive" onPress={restoreFromDrive} />
          </Section>
        ) : null}

        <Section footer="Saves a backup file you can keep in Files, iCloud Drive or Google Drive, and restore with Settings → Import data. The exported file is not encrypted, so store it somewhere private.">
          <SettingsRow icon={<Share2 size={20} color={C.text2} />} label="Export backup file" onPress={exportNow} />
        </Section>

        <Section title="Automatic snapshots" footer="A snapshot is taken once a day and before any restore, import or erase. The last 10 are kept inside the encrypted database on this device.">
          {snapshots.length === 0 ? (
            <View style={styles.empty}>
              <T variant="small" tone="secondary">
                No snapshots yet.
              </T>
            </View>
          ) : (
            snapshots.map((s) => (
              <Pressable key={s.id} style={styles.row} onPress={() => restore(s)} accessibilityRole="button" accessibilityLabel="Restore snapshot">
                <History size={20} color={C.text2} />
                <View style={{ flex: 1 }}>
                  <T variant="body">{format(parseISO(s.createdAt), 'EEE d MMM yyyy')}</T>
                  <T variant="caption" tone="secondary">
                    {format(parseISO(s.createdAt), 'HH:mm')} · {(s.bytes / 1024).toFixed(0)} KB
                  </T>
                </View>
                <T variant="small" tone="teal">
                  Restore
                </T>
              </Pressable>
            ))
          )}
        </Section>
      </ScrollView>
      <CloudBackupSheet
        mode={sheet}
        file={picked}
        onClose={() => setSheet(null)}
        onDone={(mode) => {
          load();
          if (mode === 'restore' || mode === 'restoreFile') showAlert('Restored', 'Your data has been restored from the backup.');
          if (mode === 'enable') showAlert(`${CLOUD_NAME} backup is on`, 'Your encrypted backup is saved and will be copied off your phone automatically.');
        }}
      />
      <OptionsSheet<string>
        visible={menu}
        onClose={() => setMenu(false)}
        title={`${CLOUD_NAME} backup`}
        subtitle={cloudStatus}
        value=""
        options={[
          { value: 'now', label: 'Back up now', icon: '☁️' },
          { value: 'password', label: 'Change password', icon: '🔑' },
        ]}
        onSelect={(v) => {
          if (v === 'now') backUpNow();
          if (v === 'password') setTimeout(() => setSheet('change'), 250);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 60 },
  empty: { padding: 18 },
});
