import { create } from 'zustand';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { guessHomeCurrency, isSupportedCurrency } from '@/lib/currencies';
import { guessCurrencyFormat, normalizeFormatId, type CurrencyFormatId } from '@/lib/format';
import { isAnalyticsPeriod, type AnalyticsPeriod } from '@/lib/analytics';
import type { PeriodKind } from '@/lib/period';


/** Optional fields shown on the add-transaction screen ("Activity fields"). */
export interface ActivityFields {
  name: boolean;
  accounts: boolean;
  converter: boolean;
  budgets: boolean;
  calculator: boolean;
  /** Offer the "Spread" chip for expenses too (income always has it). */
  spreadExpenses: boolean;
}

export interface Prefs {
  homeCurrency: string;
  currencyFormat: CurrencyFormatId;
  displayCents: boolean;
  haptics: boolean;
  hideBalances: boolean;
  appLock: boolean;
  /** Day of month (1-28) a monthly period starts on. */
  monthStartDay: number;
  /** 1 = Monday ... 7 = Sunday. */
  weekStartDay: number;
  /** "HH:mm" daily reminder time, or "" for never. */
  reminder: string;
  fields: ActivityFields;
  ratesUpdatedAt: string | null;
  /** False until the user has picked a home currency on first launch. */
  currencyChosen: boolean;
  /** Type the Activity tab opens on ("Make it default" in the Type filter). */
  defaultActivityType: ActivityType;
  /** Period the Analytics tab opens on ("Make it default" in its Time period sheet). */
  defaultAnalyticsPeriod: AnalyticsPeriod;
  /** Keep an encrypted backup file that Android / iCloud device backup copies off the phone. */
  cloudBackup: boolean;
  /** When that file was last written (ISO), or null. */
  cloudBackupAt: string | null;
  /** When an encrypted copy was last handed to Google Drive (ISO), or null. */
  driveBackupAt: string | null;
}

const DEFAULT_FIELDS: ActivityFields = { name: true, accounts: true, converter: false, budgets: false, calculator: false, spreadExpenses: false };

interface PrefsState extends Prefs {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

const bool = (v: string | null, fallback: boolean) => (v === null ? fallback : v === '1');
const ACTIVITY_TYPES: readonly string[] = ['all', 'expense', 'income', 'transfer'];
const activityType = (v: string | null): ActivityType => (v !== null && ACTIVITY_TYPES.includes(v) ? (v as ActivityType) : 'expense');
const clampInt = (v: string | null, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

function parseFields(raw: string | null): ActivityFields {
  if (!raw) return DEFAULT_FIELDS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...DEFAULT_FIELDS };
    for (const k of Object.keys(DEFAULT_FIELDS) as (keyof ActivityFields)[]) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return DEFAULT_FIELDS;
  }
}

function serialize<K extends keyof Prefs>(key: K, value: Prefs[K]): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (key === 'fields') return JSON.stringify(value);
  return String(value ?? '');
}

// Legacy key names from earlier versions of the app.
const STORAGE_KEY: Partial<Record<keyof Prefs, string>> = { fields: 'activityFields' };

export const usePrefs = create<PrefsState>((set) => ({
  homeCurrency: 'USD',
  currencyFormat: 'comma_dot.before',
  displayCents: false,
  haptics: true,
  hideBalances: false,
  appLock: false,
  monthStartDay: 1,
  weekStartDay: 1,
  reminder: '',
  fields: DEFAULT_FIELDS,
  ratesUpdatedAt: null,
  currencyChosen: false,
  defaultActivityType: 'expense',
  defaultAnalyticsPeriod: 'monthly',
  cloudBackup: false,
  cloudBackupAt: null,
  driveBackupAt: null,
  hydrated: false,

  hydrate: async () => {
    const db = getDb();
    const g = (k: string) => getSetting(db, k);
    const hasAnyTx = !!(await db.getFirstAsync('SELECT 1 FROM transactions LIMIT 1'));

    let home = await g('homeCurrency');
    const onboarded = await g('onboarded');
    if (!onboarded) {
      // First launch of this version: adopt the locale's currency unless the user already has data.
      if (!hasAnyTx) {
        home = guessHomeCurrency();
        await setSetting(db, 'homeCurrency', home);
        await db.runAsync('UPDATE accounts SET currency_code = ? WHERE is_default = 1', home);
      }
      await setSetting(db, 'currencyFormat', guessCurrencyFormat());
      if (!hasAnyTx) await setSetting(db, 'displayCents', '0');
      await setSetting(db, 'onboarded', '1');
    }

    // People upgrading with existing data have effectively chosen a currency already.
    let currencyChosen = (await g('currencyChosen')) === '1';
    if (!currencyChosen && hasAnyTx) {
      await setSetting(db, 'currencyChosen', '1');
      currencyChosen = true;
    }

    const fmt = await g('currencyFormat');
    const reminder = (await g('reminder')) ?? '';
    const defaultActivityType = activityType(await g('defaultActivityType'));
    // The Activity tab opens on the saved default type.
    useFiltersStore.getState().patch('activity', { type: defaultActivityType });
    const savedAnalytics = await g('defaultAnalyticsPeriod');
    const defaultAnalyticsPeriod: AnalyticsPeriod = isAnalyticsPeriod(savedAnalytics) ? savedAnalytics : 'monthly';
    useFiltersStore.getState().patch('analytics', { period: defaultAnalyticsPeriod, offset: 0 });
    set({
      homeCurrency: isSupportedCurrency(home) ? home : 'USD',
      currencyFormat: normalizeFormatId(fmt) ?? guessCurrencyFormat(),
      displayCents: bool(await g('displayCents'), false),
      haptics: bool(await g('haptics'), true),
      hideBalances: bool(await g('hideBalances'), false),
      appLock: bool(await g('appLock'), false),
      monthStartDay: clampInt(await g('monthStartDay'), 1, 28, 1),
      weekStartDay: clampInt(await g('weekStartDay'), 1, 7, 1),
      reminder: /^\d{2}:\d{2}$/.test(reminder) ? reminder : '',
      fields: parseFields(await g('activityFields')),
      ratesUpdatedAt: await g('ratesUpdatedAt'),
      currencyChosen,
      defaultActivityType,
      defaultAnalyticsPeriod,
      cloudBackup: bool(await g('cloudBackup'), false),
      cloudBackupAt: (await g('cloudBackupAt')) || null,
      driveBackupAt: (await g('driveBackupAt')) || null,
      hydrated: true,
    });
  },

  set: (key, value) => {
    set({ [key]: value } as Partial<PrefsState>);
    if (key === 'ratesUpdatedAt') return;
    setSetting(getDb(), STORAGE_KEY[key] ?? key, serialize(key, value)).catch(() => undefined);
  },
}));

export type ActivityType = 'all' | 'expense' | 'income' | 'transfer';
export type SortKind = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name';

export type FilterScope = 'activity' | 'summary' | 'analytics' | 'category';

/** Session-only filters. Each tab keeps its own set so changing one doesn't surprise another. */
export interface FilterValues {
  type: ActivityType;
  period: PeriodKind;
  /** 0 = current period, -1 = previous, ... (only for shiftable periods). */
  offset: number;
  accountId: number | null;
  /** null = all categories. */
  categoryIds: number[] | null;
  sort: SortKind;
  customFrom: string | null;
  customTo: string | null;
}

const DEFAULT_FILTERS: FilterValues = {
  type: 'expense',
  period: 'monthly',
  offset: 0,
  accountId: null,
  categoryIds: null,
  sort: 'date_desc',
  customFrom: null,
  customTo: null,
};

interface FiltersStore {
  scopes: Record<FilterScope, FilterValues>;
  patch: (scope: FilterScope, values: Partial<FilterValues>) => void;
}

const useFiltersStore = create<FiltersStore>((set) => ({
  scopes: { activity: DEFAULT_FILTERS, summary: DEFAULT_FILTERS, analytics: DEFAULT_FILTERS, category: DEFAULT_FILTERS },
  patch: (scope, values) => set((s) => ({ scopes: { ...s.scopes, [scope]: { ...s.scopes[scope], ...values } } })),
}));

/** Reads one tab's filters (re-renders only when that tab's filters change). */
export function useFilters(scope: FilterScope): FilterValues {
  return useFiltersStore((s) => s.scopes[scope]);
}

/** Non-hook accessors, safe to call from event handlers and other stores. */
export function getFilters(scope: FilterScope): FilterValues {
  return useFiltersStore.getState().scopes[scope];
}

export function filterActions(scope: FilterScope) {
  const patch = (values: Partial<FilterValues>) => useFiltersStore.getState().patch(scope, values);
  return {
    setType: (type: ActivityType) => patch({ type }),
    setPeriod: (period: PeriodKind) => patch({ period, offset: 0 }),
    setOffset: (offset: number) => patch({ offset: Math.min(0, Math.round(offset)) }),
    setAccountId: (accountId: number | null) => patch({ accountId }),
    setCategoryIds: (categoryIds: number[] | null) => patch({ categoryIds }),
    setSort: (sort: SortKind) => patch({ sort }),
    setCustomRange: (customFrom: string | null, customTo: string | null) => patch({ customFrom, customTo }),
    set: patch,
  };
}
