import type { SQLiteDatabase } from 'expo-sqlite';

import type { Currency, ExchangeRate } from '@/types';

export async function listCurrencies(db: SQLiteDatabase): Promise<Currency[]> {
  return db.getAllAsync<Currency>('SELECT code, symbol, name FROM currencies ORDER BY code ASC');
}

export async function addCurrencyIfMissing(db: SQLiteDatabase, currency: Currency) {
  await db.runAsync(
    'INSERT OR IGNORE INTO currencies (code, symbol, name) VALUES (?, ?, ?)',
    currency.code,
    currency.symbol,
    currency.name
  );
}

interface RateRow {
  base_code: string;
  target_code: string;
  rate: number;
  updated_at: string;
  is_manual: number;
}

function mapRate(row: RateRow): ExchangeRate {
  return {
    baseCode: row.base_code,
    targetCode: row.target_code,
    rate: row.rate,
    updatedAt: row.updated_at,
    isManual: row.is_manual === 1,
  };
}

export async function getRate(
  db: SQLiteDatabase,
  baseCode: string,
  targetCode: string
): Promise<ExchangeRate | null> {
  if (baseCode === targetCode) {
    return { baseCode, targetCode, rate: 1, updatedAt: new Date().toISOString(), isManual: false };
  }
  const row = await db.getFirstAsync<RateRow>(
    'SELECT * FROM exchange_rates WHERE base_code = ? AND target_code = ?',
    baseCode,
    targetCode
  );
  return row ? mapRate(row) : null;
}

export async function listRatesForBase(
  db: SQLiteDatabase,
  baseCode: string
): Promise<ExchangeRate[]> {
  const rows = await db.getAllAsync<RateRow>(
    'SELECT * FROM exchange_rates WHERE base_code = ? ORDER BY target_code ASC',
    baseCode
  );
  return rows.map(mapRate);
}

export async function upsertLiveRate(
  db: SQLiteDatabase,
  baseCode: string,
  targetCode: string,
  rate: number
) {
  const existing = await db.getFirstAsync<RateRow>(
    'SELECT * FROM exchange_rates WHERE base_code = ? AND target_code = ?',
    baseCode,
    targetCode
  );
  if (existing?.is_manual) return;
  await db.runAsync(
    `INSERT INTO exchange_rates (base_code, target_code, rate, updated_at, is_manual)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(base_code, target_code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at
     WHERE is_manual = 0`,
    baseCode,
    targetCode,
    rate,
    new Date().toISOString()
  );
}

export async function setManualRate(
  db: SQLiteDatabase,
  baseCode: string,
  targetCode: string,
  rate: number
) {
  await db.runAsync(
    `INSERT INTO exchange_rates (base_code, target_code, rate, updated_at, is_manual)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(base_code, target_code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at, is_manual = 1`,
    baseCode,
    targetCode,
    rate,
    new Date().toISOString()
  );
}

export async function clearManualRate(db: SQLiteDatabase, baseCode: string, targetCode: string) {
  await db.runAsync(
    'DELETE FROM exchange_rates WHERE base_code = ? AND target_code = ? AND is_manual = 1',
    baseCode,
    targetCode
  );
}
