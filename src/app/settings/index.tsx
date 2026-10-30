import { format } from 'date-fns';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import {
  Bell,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  Coins,
  DatabaseBackup,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Hand,
  LayoutGrid,
  Lock,
  Repeat,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { appLockSupported, authenticate, canUseAppLock } from '@/components/app-lock';
import { ModalHeader } from '@/components/modal-header';
import { APP_NAME } from '@/constants/app';
import { ExportSheet } from '@/components/export-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { CurrencySheet } from '@/components/pickers';
import { Section } from '@/components/section';
import { SettingsRow } from '@/components/settings-row';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { getDb, isDbEncrypted } from '@/db/client';
import { InvalidBackupError, parseBackupText, readImportFile, restoreSnapshot, takeSnapshot, eraseAllData } from '@/lib/backup';
import { refreshLiveRates } from '@/lib/currency';
import { buildTransactionsCsv, exportCsvAndShare, importTransactions, parseTransactionsCsv } from '@/lib/csv';
import { confirmAction, errorMessage, showAlert } from '@/lib/dialog';
import { formatMoney, ordinal } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { applyReminder, reminderSupported } from '@/lib/reminder';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C } from '@/theme';

type SheetName = 'currency' | 'reminder' | 'monthStart' | 'weekStart' | 'excel' | null;

const ICON = { size: 20, color: C.text2 } as const;
const WEEKDAYS: Record<number, string> = { 1: 'Monday', 6: 'Saturday', 7: 'Sunday' };
const REMINDER_TIMES = ['08:00', '12:00', '18:00', '20:00', '21:00', '22:00'];

export default function SettingsScreen() {
  const router = useRouter();
  const prefs = usePrefs();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
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

  const changeHomeCurrency = (code: string) =>
    run(async () => {
      if (code === prefs.homeCurrency) return;
      prefs.set('homeCurrency', code);
      await useData.getState().reloadRates();
      const n = await refreshLiveRates(getDb(), code);
      if (n > 0) prefs.set('ratesUpdatedAt', new Date().toISOString());
      await useData.getState().reloadRates();
      if (n === 0) showAlert('Offline', 'Exchange rates will update the next time you’re online.');
    });

  const changeReminder = (time: string) =>
    run(async () => {
      const ok = await applyReminder(time);
      if (!ok && time) {
        showAlert('Notifications are off', 'Allow notifications for this app in system settings to get reminders.');
        prefs.set('reminder', '');
        return;
      }
      prefs.set('reminder', time);
    });

  const toggleAppLock = (on: boolean) =>
    run(async () => {
      if (on) {
        if (!(await canUseAppLock())) {
          showAlert('Not available', 'Set up Face ID, Touch ID, fingerprint or a device passcode first.');
          return;
        }
        if (!(await authenticate('Confirm to turn on App lock'))) return;
      } else if (!(await authenticate('Confirm to turn off App lock'))) {
        return;
      }
      prefs.set('appLock', on);
    });

  const exportCsv = () =>
    run(async () => {
      const { transactions, transfers, accounts } = useData.getState();
      if (transactions.length === 0 && transfers.length === 0) {
        showAlert('Nothing to export', 'Add some transactions first.');
        return;
      }
      await exportCsvAndShare(buildTransactionsCsv(transactions, transfers, accounts));
    });

  const importData = () =>
    run(async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/csv', 'text/comma-separated-values', 'text/plain', 'public.json', '.json', '.csv', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      let text: string;
      try {
        text = await readImportFile(res.assets[0]);
      } catch (e) {
        showAlert('Can’t read file', errorMessage(e));
        return;
      }
      const db = getDb();

      if (text.trimStart().startsWith('{')) {
        let snapshot: ReturnType<typeof parseBackupText>;
        try {
          snapshot = parseBackupText(text);
        } catch (e) {
          showAlert('Invalid backup', e instanceof InvalidBackupError ? e.message : 'This file could not be read.');
          return;
        }
        const count = snapshot.tables.transactions?.length ?? 0;
        confirmAction({
          title: 'Restore backup?',
          message: `This replaces all current data with ${count} transactions from the backup. Your current data is saved as a snapshot first.`,
          confirmLabel: 'Restore',
          onConfirm: () =>
            run(async () => {
              await takeSnapshot(db);
              await restoreSnapshot(db, snapshot);
              await usePrefs.getState().hydrate();
              await useData.getState().reload();
              haptic.success();
              showAlert('Restored', 'Your backup has been restored.');
            }),
        });
        return;
      }

      const { rows, skipped } = parseTransactionsCsv(text, prefs.homeCurrency);
      if (rows.length === 0) {
        showAlert('Nothing to import', 'The file needs Date (YYYY-MM-DD) and Amount columns.');
        return;
      }
      const accounts = useData.getState().accounts;
      const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0];
      confirmAction({
        title: 'Import transactions?',
        message: `${rows.length} transactions will be added${skipped ? `, ${skipped} rows skipped` : ''}.`,
        confirmLabel: 'Import',
        destructive: false,
        onConfirm: () =>
          run(async () => {
            await takeSnapshot(db);
            const n = await importTransactions(db, rows, defaultAccount.id);
            await useData.getState().reload();
            haptic.success();
            showAlert('Imported', `${n} transactions added.`);
          }),
      });
    });

  const erase = () =>
    confirmAction({
      title: 'Erase all data?',
      message: 'All transactions, accounts, budgets and categories will be deleted. A snapshot is saved first, so you can undo this from Backup → Snapshots.',
      confirmLabel: 'Erase everything',
      onConfirm: () =>
        run(async () => {
          await eraseAllData(getDb(), prefs.homeCurrency);
          await useData.getState().reload();
          haptic.success();
          showAlert('Data erased', 'You can restore it from Backup → Snapshots.');
        }),
    });

  const reminderLabel = prefs.reminder || 'Never';
  const version = Constants.expoConfig?.version ?? '1.0.0';
  // Which cloud update is running (the built-in code until one has been downloaded and applied).
  const updateLabel =
    Updates.isEnabled && !Updates.isEmbeddedLaunch && Updates.createdAt
      ? `Update ${format(Updates.createdAt, 'd MMM, HH:mm')} · ${Updates.updateId?.slice(0, 8) ?? ''}`
      : 'No cloud update yet';

  return (
    <Screen tint="sheet" padTop={Platform.OS !== 'ios'}>
      <ModalHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="General">
          <SettingsRow icon={<LayoutGrid {...ICON} />} label="Categories" onPress={() => router.push('/settings/categories')} />
          <SettingsRow icon={<CircleDollarSign {...ICON} />} label="Currency" value={prefs.homeCurrency} onPress={() => setSheet('currency')} />
          <SettingsRow icon={<Repeat {...ICON} />} label="Recurring" onPress={() => router.push('/settings/recurring')} />
        </Section>

        <Section title="Preferences">
          {reminderSupported ? <SettingsRow icon={<Bell {...ICON} />} label="Reminder" value={reminderLabel} onPress={() => setSheet('reminder')} /> : null}
          <SettingsRow icon={<CalendarRange {...ICON} />} label="Month start day" value={ordinal(prefs.monthStartDay)} onPress={() => setSheet('monthStart')} />
          <SettingsRow icon={<CalendarDays {...ICON} />} label="First day of week" value={WEEKDAYS[prefs.weekStartDay] ?? 'Monday'} onPress={() => setSheet('weekStart')} />
          <SettingsRow
            icon={<Coins {...ICON} />}
            label="Currency format"
            value={formatMoney(1234.56, prefs.homeCurrency, { cents: true, format: prefs.currencyFormat })}
            onPress={() => router.push('/settings/currency-format')}
          />
          <SettingsRow
            icon={<CircleDollarSign {...ICON} />}
            label="Display cents"
            right={<Toggle value={prefs.displayCents} onChange={(v) => prefs.set('displayCents', v)} accessibilityLabel="Display cents" />}
          />
          {Platform.OS !== 'web' ? (
            <SettingsRow
              icon={<Hand {...ICON} />}
              label="Haptic feedback"
              right={<Toggle value={prefs.haptics} onChange={(v) => prefs.set('haptics', v)} accessibilityLabel="Haptic feedback" />}
            />
          ) : null}
        </Section>

        <Section
          title="Privacy & security"
          footer={
            isDbEncrypted()
              ? 'Your data stays on this device, encrypted with a key held in the secure hardware keystore. Nothing is sent to any server.'
              : 'Your data stays on this device. Nothing is sent to any server.'
          }>
          <SettingsRow
            icon={<EyeOff {...ICON} />}
            label="Hide balances"
            right={<Toggle value={prefs.hideBalances} onChange={(v) => prefs.set('hideBalances', v)} accessibilityLabel="Hide balances" />}
          />
          {appLockSupported ? (
            <SettingsRow
              icon={<Lock {...ICON} />}
              label="App lock"
              right={<Toggle value={prefs.appLock} onChange={toggleAppLock} accessibilityLabel="App lock" disabled={busy} />}
            />
          ) : null}
          {isDbEncrypted() ? <SettingsRow icon={<ShieldCheck {...ICON} />} label="Encrypted storage" value="On" /> : null}
        </Section>

        <Section title="Data">
          <SettingsRow icon={<DatabaseBackup {...ICON} />} label="Backup" onPress={() => router.push('/settings/backups')} />
          <SettingsRow icon={<FileSpreadsheet {...ICON} />} label="Export to Excel" onPress={() => setSheet('excel')} />
          <SettingsRow icon={<FileText {...ICON} />} label="Export CSV" onPress={exportCsv} />
          <SettingsRow icon={<Upload {...ICON} />} label="Import data" onPress={importData} />
          <SettingsRow icon={<Trash2 size={20} color={C.red} />} label="Erase data" destructive onPress={erase} />
        </Section>

        <View style={styles.footer}>
          <T variant="small" tone="tertiary" center>
            {APP_NAME} · Version {version}
          </T>
          <T variant="small" tone="tertiary" center>
            {updateLabel}
          </T>
        </View>
      </ScrollView>

      <ExportSheet visible={sheet === 'excel'} onClose={() => setSheet(null)} />
      <CurrencySheet visible={sheet === 'currency'} onClose={() => setSheet(null)} value={prefs.homeCurrency} onSelect={changeHomeCurrency} title="Home currency" />
      <OptionsSheet<string>
        visible={sheet === 'reminder'}
        onClose={() => setSheet(null)}
        title="Daily reminder"
        value={prefs.reminder}
        onSelect={changeReminder}
        options={[{ value: '', label: 'Never' }, ...REMINDER_TIMES.map((t) => ({ value: t, label: `Every day at ${t}` }))]}
      />
      <OptionsSheet<number>
        visible={sheet === 'monthStart'}
        onClose={() => setSheet(null)}
        title="Month start day"
        subtitle="Useful if you get paid on a specific day"
        value={prefs.monthStartDay}
        onSelect={(v) => prefs.set('monthStartDay', v)}
        options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) }))}
      />
      <OptionsSheet<number>
        visible={sheet === 'weekStart'}
        onClose={() => setSheet(null)}
        title="First day of week"
        value={prefs.weekStartDay}
        onSelect={(v) => prefs.set('weekStartDay', v)}
        options={[1, 7, 6].map((d) => ({ value: d, label: WEEKDAYS[d] }))}
      />
      {busy ? <View style={styles.busy} pointerEvents="auto" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  footer: { marginTop: 28, gap: 6 },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
});

