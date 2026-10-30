import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackupSheet } from '@/components/cloud-backup-sheet';
import { CurrencyList } from '@/components/pickers';
import { GradientButton } from '@/components/ui/gradient-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { getDb } from '@/db/client';
import { useKeyboardPadding } from '@/hooks/keyboard';
import { backupSummary, isCloudBackupSupported, pickBackupFile, restorePlainBackup, type EncryptedBackup } from '@/lib/cloud-backup';
import { currencyInfo, defaultFormatFor, flagEmoji } from '@/lib/currencies';
import { refreshLiveRates } from '@/lib/currency';
import { confirmAction, errorMessage, showAlert } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';

/** First-launch step: pick the home currency every total is shown in. */
export function CurrencyOnboarding() {
  const insets = useSafeAreaInsets();
  const guessed = usePrefs((s) => s.homeCurrency);
  const [code, setCode] = useState(guessed);
  const [saving, setSaving] = useState(false);
  const info = currencyInfo(code);
  const [searching, setSearching] = useState(false);
  // The list and button rise above the keyboard while searching.
  const liftStyle = useKeyboardPadding(Math.max(insets.bottom, 16));
  // New or reset phone: bring back a copy saved to Google Drive instead of starting fresh.
  // Password-protected copies (from earlier versions) need their password first.
  const [backup, setBackup] = useState<EncryptedBackup | null>(null);

  const restoreFromDrive = async () => {
    let file;
    try {
      file = await pickBackupFile();
    } catch (e) {
      showAlert('Can’t use this file', errorMessage(e));
      return;
    }
    if (!file) return;
    if (file.kind === 'encrypted') return setBackup(file);
    const { snapshot } = file;
    confirmAction({
      title: 'Restore this backup?',
      message: backupSummary(file.info),
      confirmLabel: 'Restore',
      destructive: false,
      onConfirm: async () => {
        await restorePlainBackup(snapshot);
        haptic.success();
        showAlert('Welcome back', 'Your data has been restored from the backup.');
      },
    });
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const db = getDb();
      const prefs = usePrefs.getState();
      prefs.set('homeCurrency', code);
      prefs.set('currencyFormat', defaultFormatFor(code));
      if (useData.getState().transactions.length === 0) {
        await db.runAsync('UPDATE accounts SET currency_code = ? WHERE is_default = 1', code);
      }
      await useData.getState().reload();
      haptic.success();
      prefs.set('currencyChosen', true);
      // Rates for the new base currency download in the background.
      refreshLiveRates(db, code)
        .then(async (n) => {
          if (n > 0) {
            usePrefs.getState().set('ratesUpdatedAt', new Date().toISOString());
            await useData.getState().reloadRates();
          }
        })
        .catch(() => undefined);
    } catch (e) {
      showAlert('Something went wrong', errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Screen tint="teal">
      <Animated.View style={[styles.wrap, liftStyle]}>
        {/* The intro collapses while typing so the list keeps room on short screens. */}
        <View style={[styles.header, searching && styles.headerCompact]}>
          {searching ? null : <T style={{ fontSize: 44 }}>{flagEmoji(info.region)}</T>}
          <T variant="title" center style={{ marginTop: searching ? 0 : 12 }}>
            Choose your currency
          </T>
          {searching ? null : (
            <T variant="body" tone="secondary" center style={styles.sub}>
              All totals, budgets and charts are shown in this currency. You can change it later in Settings.
            </T>
          )}
        </View>
        <View style={styles.list}>
          <CurrencyList value={code} onSelect={setCode} showRates={false} onSearchFocus={setSearching} />
        </View>
        <GradientButton label={`Continue with ${info.code}`} onPress={confirm} disabled={saving} />
        {isCloudBackupSupported && !searching ? (
          <Pressable onPress={restoreFromDrive} accessibilityRole="button" style={styles.restore} hitSlop={8}>
            <T variant="body" tone="secondary" center>
              Restore from Google Drive
            </T>
          </Pressable>
        ) : null}
      </Animated.View>
      {/* Once restored, the saved settings (including the currency) take over and this screen closes. */}
      <CloudBackupSheet
        mode={backup ? 'restoreFile' : null}
        file={backup}
        onClose={() => setBackup(null)}
        onDone={() => showAlert('Welcome back', 'Your data has been restored from the backup.')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16 },
  header: { alignItems: 'center', paddingTop: 28, paddingBottom: 18 },
  headerCompact: { paddingTop: 12, paddingBottom: 12 },
  sub: { marginTop: 8, paddingHorizontal: 12 },
  list: { flex: 1, marginBottom: 14 },
  restore: { paddingTop: 14, paddingBottom: 2 },
});
