# Speso

A private, offline-first expense and income tracker for iOS and Android, built with Expo SDK 57 +
React Native. Dark "glass" UI, fast keypad entry, and every feature unlocked — no accounts, no
subscriptions, no server.

Built by one person who isn't a full-time software engineer, working with
[Claude Code](https://claude.com/claude-code) as the coding assistant. See
[How it was built](#how-it-was-built).

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
  format, cents, haptics, hide balances, app lock, backup/snapshots, password-protected
  automatic backup (Google / iCloud), save to Google Drive, CSV and Excel export, CSV/JSON
  import, erase (undoable).
- **Spread entries** — split a large expense across several months so reports stay realistic.

Not included: Apple Pay automation, voice entry, receipt scanning, home-screen widgets and
Control Center shortcuts (the last two need native extensions outside Expo's JS runtime).

## Security & privacy

- **Encrypted at rest.** Native builds use SQLCipher (`expo-sqlite` with `useSQLCipher`). A random
  256-bit key is generated on first launch and stored in the iOS Keychain / Android Keystore via
  `expo-secure-store`. Older unencrypted databases are migrated automatically, then deleted.
  (Expo Go and web don't ship SQLCipher and fall back to an unencrypted database.)
- **App lock.** Optional Face ID / Touch ID / fingerprint / passcode gate; re-locks when the app is
  backgrounded, and a privacy cover hides balances in the app switcher.
- **No server.** Speso has no backend and no account. The only network call it makes itself is
  fetching public exchange rates over HTTPS (open.er-api.com, falling back to
  api.frankfurter.dev); responses are validated and bounded. Data only leaves the phone if you
  turn on a backup: the automatic backup is AES-GCM encrypted with your password before the OS
  copies it to Google / iCloud, and Drive copies are files you save yourself.
- **Safe imports.** Backup restore only writes columns that exist in the current schema (checked
  via `PRAGMA table_info`), binds every value, caps file size/row count, and runs in a single
  transaction. CSV import validates dates, amounts and currencies.
- **Safe exports.** CSV cells are protected against spreadsheet formula injection. Temporary export
  files are deleted after sharing. Automatic snapshots live inside the encrypted database, not as
  loose files.
- **Least privilege.** Microphone, camera and media permissions are blocked. Android Auto Backup is
  limited to the encrypted backup folder (`plugins/with-android-backup.js`); the database itself
  isn't backed up, since it would be unreadable without its keystore key.

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

JavaScript-only fixes ship as over-the-air updates to installed builds with the same app version
(`runtimeVersion` follows `version` in `app.json`):

```bash
npx eas-cli@latest update --channel preview --platform android --message "Fix …"
```

## Project structure

- `src/app/` — screens (Expo Router): `(tabs)/` Activity, Summary, Budget, Analytics, Accounts;
  `transaction/[id]` add/edit; `settings/` (categories, backups, recurring, currency format);
  `budget-edit`.
- `src/components/` — feature UI: sheets, charts (donut, bars, calendar), keypad, pickers.
  `ui/` holds the building blocks: glass, sheet + sheet host, text field, segmented, toggle.
- `src/theme/` — colours, fonts and size helpers that scale the UI down for ~360dp phones.
- `src/store/` — `data.ts` (whole ledger in memory, reloaded after writes), `prefs.ts`
  (persisted settings + session filters).
- `src/hooks/` — derived data: periods, filtered transactions, budgets, balances, money formatting.
- `src/db/` — encrypted open/migration (`open.ts`), schema, typed queries.
- `src/lib/` — currencies, formatting, rates, backup, cloud backup, CSV, Excel (`xlsx.ts`, a small
  hand-written .xlsx writer), analytics periods, validation, reminders, haptics.
- `modules/drive-save/` — local Expo native module (Kotlin) that hands a backup file to Android's
  "save document" picker so it can go straight to Google Drive.
- `plugins/` — config plugins (Android Auto Backup rules).

## How it was built

Speso was designed and built with [Claude Code](https://claude.com/claude-code). I described
features and reported bugs, usually with screenshots from my own Android phone, and Claude Code
wrote and changed the code, ran lint and type checks, tested in a web preview and produced the
EAS builds. I installed each APK, tried it on the phone and sent back what was wrong.

[`CLAUDE.md`](CLAUDE.md) holds the project notes Claude Code reads at the start of every session:
build and release steps, UI rules for small screens, and Android pitfalls found along the way
(keyboard handling, cursor jumps in sheets, drawing-order bugs, slow pure-JS crypto under Hermes).
