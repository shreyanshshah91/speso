# Speso — notes for Claude Code

Speso is a private, offline-first expense tracker built with Expo SDK 57 + React Native
(Expo Router, Zustand, expo-sqlite with SQLCipher). It's built mainly for Android and tested on a
real phone about 360dp wide. iOS works too, but there is no paid Apple Developer account.
See `README.md` for features and project structure.

## Commands

- `npx expo start`: dev server (`w` web, `a` Android emulator)
- `npm run lint`, `npx tsc --noEmit`: run both before calling a change done
- `npm run build:android`: EAS preview APK (account `shreyanshshah98`)
- JS-only fixes can ship over the air instead of as a new APK:
  `npx eas-cli@latest update --channel preview --environment preview --platform android --message "…" --non-interactive`

## Versioning

- `runtimeVersion` policy is `appVersion`. An OTA update only reaches builds whose `version` in
  `app.json` matches, so leave `version` alone for OTA fixes.
- For a new native build (native deps, plugins, `modules/`), bump `version`, `android.versionCode`
  and `ios.buildNumber` together.
- EAS free plan builds can run out mid-month. Prefer OTA when no native code changed.
- There is no Java on this Mac, so `modules/drive-save` (Kotlin) only compiles on EAS.

## Names and ids

- The app was called Kova → Saldo → Spesa → **Speso**. The display name lives in
  `src/constants/app.ts` (`APP_NAME`) and `app.json` `name`.
- Internal ids stay `kova` (backup folder `kova-backup/`, `latest.kova`, envelope `app: 'kova'`,
  secure-store keys) so old backups still restore. Don't rename them. The Android package stays
  `com.shreyanshshah.expensetracker`.

## UI rules

- Check layouts at **360px** width, not only 393. Sizing helpers are in `src/theme` (`UI_SCALE`,
  `fs`, `sz`, `CHART_H`, `KEY_H`), and `T` scales fonts.
- Keep things consistent: uniform label sizes in a grid, constant-size selection pills.
- Text inputs: always use `TextField` (`src/components/ui/text-field.tsx`), never a controlled RN
  `TextInput`. Sheets render through `SheetHost`, so a controlled input gets stale text pushed back
  and the cursor jumps on Android. Validate amounts on save; don't filter keystrokes.
- Keyboard is edge-to-edge on Android. Use react-native-keyboard-controller (`Sheet` lifts itself,
  `useKeyboardPadding`, `KeyboardAwareScrollView`).
- React Compiler is on. Use Reanimated `.get()` / `.set()`, not `.value`, and avoid setState
  inside effects (use `useOnOpen` for sheet resets).

## Android gotchas

- No `zIndex` on native (stale drawing order hides content); it's web-only here.
- No Reanimated layout animations (`LinearTransition`) in the tab bar; they dropped a tab.
- A View whose `backgroundColor` changes after mount can lose its `borderRadius`. Remount it with
  a `key` tied to the colour, or draw it in SVG.
- Screen-level `BackHandler` listeners must be registered in `useFocusEffect`.
- Pure-JS crypto (e.g. PBKDF2 from @noble) takes minutes under Hermes. Use expo-crypto's native
  SHA-256 and native AES.

## Data

- `useData.transactions` holds the real entries. `useData.ledger` holds monthly shares for
  entries spread over N months (`spread_months`); reports read the ledger.
- Backup restore only writes columns that exist in the current schema and runs in one
  transaction. Keep it that way when adding columns.
- Analytics periods follow `src/lib/analytics.ts`: Weekly = days of one week, Monthly = 6 months,
  Quarterly = Q1–Q4, Yearly = 6 years. Keep the purple "income left" bars as they are.

## Web preview testing

- Web SQLite (OPFS) can't open in two tabs of the same origin, so test on a separate port from
  the one the user has open.
- The preview's drag action doesn't drive gesture-handler pans. Dispatch stepped PointerEvents
  from JS instead.
