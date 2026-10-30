# Speso

A private, offline-first expense and income tracker for iOS and Android, built with Expo SDK 57 +
React Native. Dark "glass" UI, fast keypad entry, and every feature unlocked — no accounts, no
subscriptions, no server.

## Features

- **Activity** — daily spend chart with average line, day-grouped list, search, long-press to
  duplicate/delete, period picker (this/last month, week, year and earlier).
- **Summary** — segmented ring per category with share %, filters for type, period, account and
  categories.
- **Budget** — monthly total and per-category limits, ring + grid/list views, over-budget states.
- **Analytics** — income vs expenses per period, "income left" (amount or savings rate),
  spend calendar, recurring and budget insights.
- **Accounts** — multiple accounts in any currency, current balances, drag to reorder,
  transfers between accounts.
- **Add transaction** — calculator keypad (+ − × ÷), repeat weekly/monthly/yearly, date,
  account, name (with suggestions), live currency converter, budget-left chip. Choose which
  fields appear under ⋮ → Activity fields.
- **Settings** — categories (emoji, colour, reorder), home currency with live rates (manual
  overrides kept), reminder notification, month start day, first day of week, currency
  format, cents, haptics, hide balances, app lock, backup/snapshots, CSV export, CSV/JSON
  import, erase (undoable).

Not included: Apple Pay automation, voice entry, receipt scanning, home-screen widgets and
Control Center shortcuts (the last two need native extensions outside Expo's JS runtime).

## Security & privacy

- **Encrypted at rest.** Native builds use SQLCipher (`expo-sqlite` with `useSQLCipher`). A random
  256-bit key is generated on first launch and stored in the iOS Keychain / Android Keystore via
  `expo-secure-store`. Older unencrypted databases are migrated automatically, then deleted.
  (Expo Go and web don't ship SQLCipher and fall back to an unencrypted database.)
- **App lock.** Optional Face ID / Touch ID / fingerprint / passcode gate; re-locks when the app is
  backgrounded, and a privacy cover hides balances in the app switcher.
- **No data leaves the device.** The only network call is fetching public exchange rates over
  HTTPS (open.er-api.com, falling back to api.frankfurter.dev); responses are validated and
  bounded.
- **Safe imports.** Backup restore only writes columns that exist in the current schema (checked
  via `PRAGMA table_info`), binds every value, caps file size/row count, and runs in a single
  transaction. CSV import validates dates, amounts and currencies.
- **Safe exports.** CSV cells are protected against spreadsheet formula injection. Temporary export
  files are deleted after sharing. Automatic snapshots live inside the encrypted database, not as
  loose files.
- **Least privilege.** Microphone, camera and media permissions are blocked; Android auto-backup is
  disabled (a backed-up database would be unreadable without its keystore key — use the in-app
  backup instead).

## Run locally

```bash
npm install
npx expo start
```

Press `w` for web, `a` for an Android emulator, `i` for the iOS simulator.

## Build

Android APK (installable directly, no Play Store needed):

```bash
npm run build:android
```

iOS without a paid Apple Developer account (installs over USB, re-sign every 7 days):

```bash
npm run build:ios:device
```

With a paid account, `npx eas-cli build --platform ios` produces a TestFlight / ad-hoc build.

## Project structure

- `src/app/` — screens (Expo Router): `(tabs)/` Activity, Summary, Budget, Analytics, Accounts;
  `transaction/[id]` add/edit; `settings/`; `budget-edit`.
- `src/components/` — UI: glass surfaces, sheets, charts (donut, bars, calendar), keypad, pickers.
- `src/store/` — `data.ts` (whole ledger in memory, reloaded after writes), `prefs.ts`
  (persisted settings + session filters).
- `src/hooks/` — derived data: periods, filtered transactions, budgets, balances, money formatting.
- `src/db/` — encrypted open/migration (`open.ts`), schema, typed queries.
- `src/lib/` — currencies, formatting, rates, backup, CSV, validation, reminders, haptics.
