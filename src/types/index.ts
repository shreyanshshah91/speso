export type TransactionType = 'expense' | 'income';
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Account {
  id: number;
  name: string;
  icon: string;
  color: string;
  currencyCode: string;
  openingBalance: number;
  isDefault: boolean;
  sortOrder: number;
  archived: boolean;
}

export interface AccountTransfer {
  id: number;
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  currencyCode: string;
  date: string;
  note: string;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export interface ExchangeRate {
  baseCode: string;
  targetCode: string;
  rate: number;
  updatedAt: string;
  isManual: boolean;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  isDefault: boolean;
  sortOrder: number;
}

export interface Transaction {
  id: number;
  amount: number;
  currencyCode: string;
  categoryId: number;
  accountId: number;
  type: TransactionType;
  note: string;
  date: string;
  receiptUri: string | null;
  recurringRuleId: number | null;
  /** Months the amount is spread across in reports (1 = just the month it happened). */
  spreadMonths: number;
  /** Or an exact covered date range (yyyy-MM-dd), split by the days in each month. */
  spreadFrom?: string | null;
  spreadTo?: string | null;
}

export interface TransactionWithCategory extends Transaction {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  /** Set on the monthly shares of a spread entry (see `expandSpread`): which share this is, and
   * the entry's full amount. */
  part?: { index: number; of: number; total: number };
}

export interface RecurringRule {
  id: number;
  amount: number;
  currencyCode: string;
  categoryId: number;
  accountId: number;
  type: TransactionType;
  note: string;
  frequency: RecurringFrequency;
  dayOfPeriod: number;
  nextRunDate: string;
  active: boolean;
}

export interface Budget {
  id: number;
  categoryId: number | null;
  accountId: number | null;
  amount: number;
  currencyCode: string;
  period: 'monthly';
  startDate: string;
}
