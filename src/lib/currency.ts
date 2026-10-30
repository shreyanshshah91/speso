import type { SQLiteDatabase } from 'expo-sqlite';

import { CURRENCIES, CURRENCY_CODE_RE, isSupportedCurrency } from '@/lib/currencies';

// Two free, key-less HTTPS sources. The first covers ~160 currencies; the second (ECB data) is a
// fallback for the major ones.
const PRIMARY = (base: string) => `https://open.er-api.com/v6/latest/${base}`;
const FALLBACK = (base: string) => `https://api.frankfurter.dev/v1/latest?base=${base}`;

const TIMEOUT_MS = 10_000;
const KNOWN = new Set(CURRENCIES.map((c) => c.code));

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Keeps only sane, positive, finite rates for currencies we know about. */
function sanitizeRates(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN.has(code)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e9) continue;
    out[code] = value;
  }
  return out;
}

/**
 * Downloads rates for `base` -> every known currency and caches them in `exchange_rates`.
 * Manually entered rates are never overwritten. Returns the number of rates stored.
 */
export async function refreshLiveRates(db: SQLiteDatabase, base: string): Promise<number> {
  if (!CURRENCY_CODE_RE.test(base) || !isSupportedCurrency(base)) return 0;

  let rates: Record<string, number> = {};
  try {
    const data = (await fetchJson(PRIMARY(base))) as { result?: string; rates?: unknown };
    if (data?.result === 'success') rates = sanitizeRates(data.rates);
  } catch {
    // fall through to the fallback source
  }
  if (Object.keys(rates).length === 0) {
    try {
      const data = (await fetchJson(FALLBACK(base))) as { rates?: unknown };
      rates = sanitizeRates(data?.rates);
    } catch {
      return 0;
    }
  }

  const now = new Date().toISOString();
  let stored = 0;
  await db.withTransactionAsync(async () => {
    for (const [code, rate] of Object.entries(rates)) {
      if (code === base) continue;
      await db.runAsync(
        `INSERT INTO exchange_rates (base_code, target_code, rate, updated_at, is_manual)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(base_code, target_code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at
         WHERE exchange_rates.is_manual = 0`,
        base,
        code,
        rate,
        now
      );
      stored++;
    }
  });
  if (stored > 0) {
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('ratesUpdatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      now
    );
  }
  return stored;
}

export interface RateRow {
  base_code: string;
  target_code: string;
  rate: number;
  is_manual: number;
}

/**
 * Builds a map of "how many home-currency units is 1 unit of X" from every cached rate, using
 * direct (home -> X) rates first and inverse (X -> home) rates as a fallback.
 */
export function buildToHomeMap(rows: RateRow[], home: string): Record<string, number> {
  const map: Record<string, number> = { [home]: 1 };
  for (const r of rows) {
    if (r.base_code === home && r.rate > 0) map[r.target_code] = 1 / r.rate;
  }
  for (const r of rows) {
    if (r.target_code === home && r.rate > 0 && map[r.base_code] === undefined) map[r.base_code] = r.rate;
  }
  return map;
}

export async function setManualRate(db: SQLiteDatabase, home: string, code: string, homePerUnit: number) {
  if (!isSupportedCurrency(home) || !isSupportedCurrency(code)) return;
  if (!Number.isFinite(homePerUnit) || homePerUnit <= 0) return;
  await db.runAsync(
    `INSERT INTO exchange_rates (base_code, target_code, rate, updated_at, is_manual)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(base_code, target_code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at, is_manual = 1`,
    home,
    code,
    1 / homePerUnit,
    new Date().toISOString()
  );
}

export async function clearManualRate(db: SQLiteDatabase, home: string, code: string) {
  await db.runAsync(
    'DELETE FROM exchange_rates WHERE base_code = ? AND target_code = ? AND is_manual = 1',
    home,
    code
  );
}
