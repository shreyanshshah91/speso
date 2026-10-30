import type { SQLiteDatabase } from 'expo-sqlite';

export const SCHEMA_VERSION = 6;

const DEFAULT_CURRENCIES: [string, string, string][] = [
  ['USD', '$', 'US Dollar'],
  ['EUR', '€', 'Euro'],
  ['GBP', '£', 'British Pound'],
  ['INR', '₹', 'Indian Rupee'],
  ['JPY', '¥', 'Japanese Yen'],
  ['AUD', 'A$', 'Australian Dollar'],
  ['CAD', 'C$', 'Canadian Dollar'],
  ['CHF', 'CHF', 'Swiss Franc'],
  ['CNY', '¥', 'Chinese Yuan'],
  ['ZAR', 'R', 'South African Rand'],
];

// Default expense categories, seeded on first launch and after "Erase data".
const DEFAULT_EXPENSE_CATEGORIES: [string, string, string][] = [
  ['Housing', '🏠', '#818BF7'],
  ['Food', '🍽️', '#11B7FD'],
  ['Groceries', '🛒', '#F46674'],
  ['Utilities', '💡', '#F5C544'],
  ['Transportation', '🚗', '#F49763'],
  ['Shopping', '🛍️', '#EC7FD0'],
  ['Clothes', '👕', '#5BC8E8'],
  ['Going out', '🍻', '#A78BFA'],
  ['Entertainment', '🍿', '#3DD9C4'],
  ['Subscriptions', '📅', '#F2789F'],
  ['Extras', '🙌', '#9CA3AF'],
];

const DEFAULT_INCOME_CATEGORIES: [string, string, string][] = [
  ['Salary', '💰', '#22C55E'],
  ['Investments', '📈', '#06B6D4'],
  ['Per Diems', '💵', '#14B8A6'],
];

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = result?.user_version ?? 0;
  if (currentVersion >= SCHEMA_VERSION) return;

  if (currentVersion < 1) {
    await runV1(db);
    currentVersion = 1;
  }

  if (currentVersion < 2) {
    // The app dropped income tracking entirely — remove any income data from installs
    // that already seeded/created it under v1.
    await db.execAsync(`
      DELETE FROM transactions WHERE type = 'income';
      DELETE FROM recurring_rules WHERE type = 'income';
      DELETE FROM budgets WHERE category_id IN (SELECT id FROM categories WHERE type = 'income');
      DELETE FROM categories WHERE type = 'income';
    `);
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    await runV3(db);
    currentVersion = 3;
  }

  if (currentVersion < 4) {
    await runV4(db);
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    // An entry can cover several months (e.g. a per diem paid once for a quarter): reports count
    // an equal share in each month, balances count the full amount on the day it happened.
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    if (!cols.some((c) => c.name === 'spread_months')) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN spread_months INTEGER NOT NULL DEFAULT 1;');
    }
    currentVersion = 5;
  }

  if (currentVersion < 6) {
    // Spreads can also cover an exact date range (e.g. a per diem for 27 Aug – 22 Nov), split in
    // proportion to the days in each month.
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    if (!cols.some((c) => c.name === 'spread_from')) await db.execAsync('ALTER TABLE transactions ADD COLUMN spread_from TEXT;');
    if (!cols.some((c) => c.name === 'spread_to')) await db.execAsync('ALTER TABLE transactions ADD COLUMN spread_to TEXT;');
    currentVersion = 6;
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function runV1(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      base_code TEXT NOT NULL,
      target_code TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (base_code, target_code)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      currency_code TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      receipt_uri TEXT,
      recurring_rule_id INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      currency_code TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      note TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
      day_of_period INTEGER NOT NULL,
      next_run_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency_code TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'monthly',
      start_date TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  for (const [code, symbol, name] of DEFAULT_CURRENCIES) {
    await db.runAsync(
      'INSERT OR IGNORE INTO currencies (code, symbol, name) VALUES (?, ?, ?)',
      code,
      symbol,
      name
    );
  }

  await seedDefaultExpenseCategories(db);

  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('homeCurrency', 'USD')"
  );
  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('themeMode', 'system')"
  );
  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('monthStartDay', '1')"
  );
  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('cycleType', 'monthly')"
  );
  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('weekStartDay', '1')"
  );
}

async function runV3(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏦',
      color TEXT NOT NULL DEFAULT '#3B82F6',
      currency_code TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS account_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_id INTEGER NOT NULL,
      to_account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency_code TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (from_account_id) REFERENCES accounts(id),
      FOREIGN KEY (to_account_id) REFERENCES accounts(id)
    );

    ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id);
    ALTER TABLE recurring_rules ADD COLUMN account_id INTEGER REFERENCES accounts(id);
    ALTER TABLE budgets ADD COLUMN account_id INTEGER REFERENCES accounts(id);
  `);

  const homeCurrencyRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'homeCurrency'"
  );
  const homeCurrency = homeCurrencyRow?.value ?? 'USD';

  const defaultAccountId = await seedDefaultAccountAndIncomeCategories(db, homeCurrency);

  await db.execAsync(
    `UPDATE transactions SET account_id = ${defaultAccountId} WHERE account_id IS NULL;
     UPDATE recurring_rules SET account_id = ${defaultAccountId} WHERE account_id IS NULL;`
  );

  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('hideBalances', '0')"
  );
  await db.runAsync(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('displayCents', '1')"
  );
}

async function runV4(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_date ON account_transfers(date);

    -- Rolling automatic snapshots, stored inside the (encrypted) database rather than as loose
    -- plaintext files. Kept across "Erase data" so an accidental erase can be undone.
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  // Earlier versions defaulted to USD and a generic account name; new installs pick the home
  // currency from the device locale (see AppInit), so only rename the untouched default account.
  await db.runAsync(
    "UPDATE accounts SET name = 'Main account' WHERE name = 'Main Account' AND is_default = 1"
  );
}

/** Seeds one default account (in `homeCurrency`) plus the default income categories. Used both by
 * the v3 migration and by "Erase data", which resets everything back to this fresh state. Returns
 * the new account's id. */
export async function seedDefaultAccountAndIncomeCategories(
  db: SQLiteDatabase,
  homeCurrency: string
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO accounts (name, icon, color, currency_code, opening_balance, is_default, sort_order, archived)
     VALUES ('Main account', '🏦', '#EAB308', ?, 0, 1, 0, 0)`,
    homeCurrency
  );

  let sortOrder = 0;
  for (const [name, icon, color] of DEFAULT_INCOME_CATEGORIES) {
    await db.runAsync(
      'INSERT INTO categories (name, icon, color, type, is_default, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
      name,
      icon,
      color,
      'income',
      sortOrder++
    );
  }

  return result.lastInsertRowId;
}

/** Seeds the default expense categories. Used both by the v1 migration and by "Erase data". */
export async function seedDefaultExpenseCategories(db: SQLiteDatabase) {
  let sortOrder = 0;
  for (const [name, icon, color] of DEFAULT_EXPENSE_CATEGORIES) {
    await db.runAsync(
      'INSERT INTO categories (name, icon, color, type, is_default, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
      name,
      icon,
      color,
      'expense',
      sortOrder++
    );
  }
}
