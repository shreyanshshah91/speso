import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { isSupportedCurrency } from '@/lib/currencies';
import { inTransaction } from '@/db/transaction';
import { downloadInBrowser } from '@/lib/download';
import { isValidSpreadRange } from '@/lib/spread';
import { LIMITS, cleanText, isValidAmount, isValidISODate } from '@/lib/validate';
import type { Account, AccountTransfer, TransactionType, TransactionWithCategory } from '@/types';

const HEADER = ['Date', 'Type', 'Category', 'Name', 'Amount', 'Currency', 'Account', 'Spread months', 'Spread from', 'Spread to'];

/**
 * Quotes a CSV cell and neutralises spreadsheet formula injection: a cell starting with
 * = + - @ (or tab / CR) is prefixed with an apostrophe so Excel/Sheets treat it as text.
 */
function cell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildTransactionsCsv(
  transactions: TransactionWithCategory[],
  transfers: AccountTransfer[],
  accounts: Account[]
): string {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const lines = [HEADER.join(',')];
  for (const t of transactions) {
    lines.push(
      [t.date, t.type, t.categoryName, t.note, t.amount.toFixed(2), t.currencyCode, accountName.get(t.accountId) ?? '', String(t.spreadMonths ?? 1), t.spreadFrom ?? '', t.spreadTo ?? '']
        .map(cell)
        .join(',')
    );
  }
  for (const tr of transfers) {
    const note = `${accountName.get(tr.fromAccountId) ?? ''} → ${accountName.get(tr.toAccountId) ?? ''}${tr.note ? ` · ${tr.note}` : ''}`;
    lines.push([tr.date, 'transfer', '', note, tr.amount.toFixed(2), tr.currencyCode, '', '1', '', ''].map(cell).join(','));
  }
  return lines.join('\n');
}

export async function exportCsvAndShare(csv: string): Promise<void> {
  const name = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === 'web') {
    downloadInBrowser(name, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    return;
  }
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.write(csv);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export transactions', UTI: 'public.comma-separated-values-text' });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }
}

/** RFC 4180-style parser (quoted fields, escaped quotes, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > LIMITS.importRows) break;
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

interface ParsedRow {
  date: string;
  type: TransactionType;
  category: string;
  note: string;
  amount: number;
  currency: string;
  account: string;
  spreadMonths: number;
  spreadFrom: string | null;
  spreadTo: string | null;
}

const unquoteFormula = (v: string) => (v.startsWith("'") && /^'[=+\-@]/.test(v) ? v.slice(1) : v);

/**
 * Accepts this app's own export (Date, Type, Category, Name, Amount, Currency, Account) and, by
 * header name, most simple exports that have at least Date and Amount columns.
 */
export function parseTransactionsCsv(text: string, fallbackCurrency: string): { rows: ParsedRow[]; skipped: number } {
  const table = parseCsv(text.replace(/^﻿/, ''));
  if (table.length < 2) return { rows: [], skipped: 0 };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col('date');
  const iType = col('type');
  const iCat = col('category');
  const iName = col('name', 'note', 'description');
  const iAmount = col('amount');
  const iCur = col('currency');
  const iAcct = col('account');
  const iSpread = col('spread months', 'spread');
  const iFrom = col('spread from');
  const iTo = col('spread to');
  if (iDate < 0 || iAmount < 0) return { rows: [], skipped: table.length - 1 };

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const date = (r[iDate] ?? '').trim();
    const rawType = iType >= 0 ? (r[iType] ?? '').trim().toLowerCase() : '';
    if (rawType === 'transfer') {
      skipped++;
      continue;
    }
    let amount = Number((r[iAmount] ?? '').replace(/[^\d.\-]/g, ''));
    // Without a Type column every row is treated as an expense.
    const type: TransactionType = rawType === 'income' ? 'income' : 'expense';
    amount = Math.abs(amount);
    const currency = iCur >= 0 ? (r[iCur] ?? '').trim().toUpperCase() : '';
    if (!isValidISODate(date) || !isValidAmount(amount) || amount === 0) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      type,
      category: cleanText(unquoteFormula(iCat >= 0 ? (r[iCat] ?? '') : ''), LIMITS.name) || 'Other',
      note: cleanText(unquoteFormula(iName >= 0 ? (r[iName] ?? '') : ''), LIMITS.note),
      amount: Math.round(amount * 100) / 100,
      currency: isSupportedCurrency(currency) ? currency : fallbackCurrency,
      account: cleanText(unquoteFormula(iAcct >= 0 ? (r[iAcct] ?? '') : ''), LIMITS.name),
      spreadMonths: iSpread >= 0 ? Math.min(36, Math.max(1, Math.round(Number(r[iSpread]) || 1))) : 1,
      ...(() => {
        const from = iFrom >= 0 ? (r[iFrom] ?? '').trim() : '';
        const to = iTo >= 0 ? (r[iTo] ?? '').trim() : '';
        return isValidSpreadRange(from, to) ? { spreadFrom: from, spreadTo: to } : { spreadFrom: null, spreadTo: null };
      })(),
    });
  }
  return { rows, skipped };
}

/** Imports parsed rows in one transaction, matching categories/accounts by name (creating
 * categories when needed). Returns how many transactions were added. */
export async function importTransactions(db: SQLiteDatabase, rows: ParsedRow[], defaultAccountId: number): Promise<number> {
  const cats = await db.getAllAsync<{ id: number; name: string; type: string }>('SELECT id, name, type FROM categories');
  const accts = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM accounts WHERE archived = 0');
  const catKey = (type: string, name: string) => `${type}:${name.toLowerCase()}`;
  const catMap = new Map(cats.map((c) => [catKey(c.type, c.name), c.id]));
  const acctMap = new Map(accts.map((a) => [a.name.toLowerCase(), a.id]));

  let added = 0;
  await inTransaction(db, async (txn) => {
    let order = (await txn.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM categories'))?.m ?? 0;
    for (const r of rows) {
      let categoryId = catMap.get(catKey(r.type, r.category));
      if (categoryId === undefined) {
        const res = await txn.runAsync(
          'INSERT INTO categories (name, icon, color, type, is_default, sort_order) VALUES (?, ?, ?, ?, 0, ?)',
          r.category,
          r.type === 'income' ? '💰' : '📦',
          '#9CA3AF',
          r.type,
          ++order
        );
        categoryId = res.lastInsertRowId;
        catMap.set(catKey(r.type, r.category), categoryId);
      }
      const accountId = (r.account && acctMap.get(r.account.toLowerCase())) || defaultAccountId;
      await txn.runAsync(
        `INSERT INTO transactions (amount, currency_code, category_id, account_id, type, note, date, receipt_uri, recurring_rule_id, spread_months, spread_from, spread_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        r.amount,
        r.currency,
        categoryId,
        accountId,
        r.type,
        r.note,
        r.date,
        r.spreadMonths,
        r.spreadFrom,
        r.spreadTo
      );
      added++;
    }
  });
  return added;
}
