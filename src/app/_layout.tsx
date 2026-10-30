import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import * as Notifications from 'expo-notifications';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AppLockGate } from '@/components/app-lock';
import { SheetHost } from '@/components/ui/sheet-host';
import { CurrencyOnboarding } from '@/components/currency-onboarding';
import { LaunchOverlay } from '@/components/launch-overlay';
import { UpdatePrompt } from '@/components/update-prompt';
import { RestoreBackup } from '@/components/restore-backup';
import { setDb } from '@/db/client';
import { keyPragma, prepareDatabase, type DatabaseTarget } from '@/db/open';
import { runDueRecurringRules } from '@/db/queries/recurring';
import { migrateDbIfNeeded } from '@/db/schema';
import { checkAndRunDailyBackup } from '@/lib/backup';
import { cleanStaleDriveBackupCache, readCloudBackupInfo, startCloudBackupAutoSave, useRestoreOffer } from '@/lib/cloud-backup';
import { showAlert } from '@/lib/dialog';
import { refreshLiveRates } from '@/lib/currency';
import { applyReminder } from '@/lib/reminder';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// iOS keeps its native modal sheet (with the card-stack effect). Android has no equivalent, so its
// modal screens slide up smoothly instead of the default quick fade.
const MODAL = { presentation: 'modal', animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default' } as const;

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bgBottom, card: C.sheet, primary: C.tealText },
};

function AppInit({ target, children }: { target: DatabaseTarget; children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDb(db, !!target.key);
      await usePrefs.getState().hydrate();
      await runDueRecurringRules(db).catch(() => 0);
      await useData.getState().reload();
      // Fresh install with a backup brought back by Google / iCloud device backup: offer it first.
      if (!usePrefs.getState().currencyChosen && useData.getState().transactions.length === 0) {
        useRestoreOffer.getState().setInfo(readCloudBackupInfo());
      }
      if (cancelled) return;
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);

      if (target.recoveredFromUnreadable) {
        showAlert(
          'Started a fresh ledger',
          'Your previous data could not be decrypted on this device. You can restore it from a backup in Settings → Import data.'
        );
      }

      // Non-blocking background work.
      const prefs = usePrefs.getState();
      const age = prefs.ratesUpdatedAt ? Date.now() - Date.parse(prefs.ratesUpdatedAt) : Infinity;
      if (!(age < RATES_MAX_AGE_MS)) {
        refreshLiveRates(db, prefs.homeCurrency)
          .then(async (n) => {
            if (n > 0) {
              usePrefs.getState().set('ratesUpdatedAt', new Date().toISOString());
              await useData.getState().reloadRates();
            }
          })
          .catch(() => undefined);
      }
      checkAndRunDailyBackup(db).catch(() => undefined);
      if (prefs.reminder) applyReminder(prefs.reminder).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, target.key, target.recoveredFromUnreadable]);

  // Keep the encrypted cloud backup file fresh while backups are on.
  useEffect(() => (ready ? startCloudBackupAutoSave() : undefined), [ready]);
  useEffect(() => {
    if (ready) cleanStaleDriveBackupCache();
  }, [ready]);

  if (!ready) return null;
  return <>{children}</>;
}

function RootNavigator() {
  const currencyChosen = usePrefs((s) => s.currencyChosen);
  const restoreOffer = useRestoreOffer((s) => s.info);
  if (!currencyChosen) {
    return (
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        {restoreOffer ? <RestoreBackup info={restoreOffer} /> : <CurrencyOnboarding />}
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bgBottom } }}>
        <Stack.Screen name="(tabs)" />
        {/* On Android the add screen is a transparent modal so swiping it down reveals the tab beneath. */}
        <Stack.Screen
          name="transaction/[id]"
          options={{
            ...MODAL,
            gestureEnabled: true,
            // Android: the app slides this screen itself (see transaction/[id]), so no native animation.
            ...(Platform.OS === 'android' ? { presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } } : null),
          }}
        />
        <Stack.Screen name="settings" options={MODAL} />
        <Stack.Screen name="budget-edit" options={MODAL} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  const [target, setTarget] = useState<DatabaseTarget | null>(null);

  useEffect(() => {
    prepareDatabase().then(setTarget);
  }, []);

  const onInit = useCallback(
    async (db: SQLiteDatabase) => {
      if (target?.key) await db.execAsync(keyPragma(target.key));
      await migrateDbIfNeeded(db);
    },
    [target]
  );

  // The splash screen stays up until fonts, database and preload have all finished.
  if ((!fontsLoaded && !fontError) || !target) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bgBottom }}>
      <KeyboardProvider>
      <Suspense fallback={<View style={{ flex: 1, backgroundColor: C.bgBottom }} />}>
        <SQLiteProvider databaseName={target.name} onInit={onInit} useSuspense>
          <AppInit target={target}>
            <SheetHost>
              <AppLockGate>
                <RootNavigator />
                <UpdatePrompt />
              </AppLockGate>
            </SheetHost>
            <LaunchOverlay />
          </AppInit>
        </SQLiteProvider>
      </Suspense>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
