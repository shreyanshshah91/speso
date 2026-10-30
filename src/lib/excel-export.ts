import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { downloadInBrowser } from '@/lib/download';
import { buildXlsx, XLSX_MIME, type XlsxSheet } from '@/lib/xlsx';
import { toHomeAmount, useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import type { AccountTransfer, TransactionWithCategory } from '@/types';

/** The dates to export (inclusive, yyyy-MM-dd); null ends mean "from the start" / "to today". */
export interface ExportRange {
  from: string | null;
  to: string | null;
  /** "September 2026", "2026", "27 Aug – 22 Nov 2026", "All time". */
  label: string;
  /** For the file name: "2026-09", "2026", "2026-08-27_2026-11-22", "all-time". */
  fileLabel: string;
}

const inRange = (date: string, r: ExportRange) => (!r.from || date >= r.from) && (!r.to || date <= r.to);

/** Transactions (real entries, not spread shares) and transfers in the range, oldest first. */
export function entriesInRange(r: ExportRange): { transactions: TransactionWithCategory[]; transfers: AccountTransfer[] } {
  const { transactions, transfers } = useData.getState();
  const byDate = <T extends { date: string; id: number }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
  return {
    transactions: transactions.filter((t) => inRange(t.date, r)).sort(byDate),
    transfers: transfers.filter((t) => inRange(t.date, r)).sort(byDate),
  };
}

const TYPE_LABEL = { expense: 'Expense', income: 'Income' } as const;
const round2 = (v: number) => Math.round(v * 100) / 100;

function buildWorkbook(r: ExportRange): { sheets: XlsxSheet[]; count: number } {
  const { accounts, toHome } = useData.getState();
  const home = usePrefs.getState().homeCurrency;
  const toHomeValue = (amount: number, code: string) => round2(toHomeAmount(toHome, amount, code));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const { transactions, transfers } = entriesInRange(r);

  const rows: (string | number | null)[][] = [];
  for (const t of transactions) {
    const spread =
      t.spreadFrom && t.spreadTo ? `${t.spreadFrom} to ${t.spreadTo}` : t.spreadMonths > 1 ? `${t.spreadMonths} months` : null;
    rows.push([
      t.date,
      TYPE_LABEL[t.type],
      t.categoryName,
      t.note || null,
      accountName.get(t.accountId) ?? null,
      round2(t.amount),
      t.currencyCode,
      toHomeValue(t.amount, t.currencyCode),
      spread,
    ]);
  }
  for (const tr of transfers) {
    rows.push([
      tr.date,
      'Transfer',
      null,
      tr.note || null,
      `${accountName.get(tr.fromAccountId) ?? '?'} → ${accountName.get(tr.toAccountId) ?? '?'}`,
      round2(tr.amount),
      tr.currencyCode,
      toHomeValue(tr.amount, tr.currencyCode),
      null,
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  // Totals by category, in the home currency.
  const byCategory = new Map<string, { name: string; type: 'expense' | 'income'; count: number; total: number }>();
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    const v = toHomeAmount(toHome, t.amount, t.currencyCode);
    if (t.type === 'income') income += v;
    else expenses += v;
    const key = `${t.type}:${t.categoryId}`;
    const c = byCategory.get(key) ?? { name: t.categoryName, type: t.type, count: 0, total: 0 };
    c.count += 1;
    c.total += v;
    byCategory.set(key, c);
  }
  const summaryRows = [...byCategory.values()]
    .sort((a, b) => (a.type !== b.type ? (a.type === 'expense' ? -1 : 1) : b.total - a.total))
    .map((c) => {
      const typeTotal = c.type === 'income' ? income : expenses;
      return [c.name, TYPE_LABEL[c.type], c.count, round2(c.total), typeTotal > 0 ? c.total / typeTotal : null];
    });

  return {
    count: transactions.length + transfers.length,
    sheets: [
      {
        name: 'Transactions',
        columns: [
          { header: 'Date', type: 'date', width: 12 },
          { header: 'Type', width: 10 },
          { header: 'Category', width: 20 },
          { header: 'Name', width: 30 },
          { header: 'Account', width: 22 },
          { header: 'Amount', type: 'money', width: 13 },
          { header: 'Currency', width: 9 },
          { header: `Amount (${home})`, type: 'money', width: 15 },
          { header: 'Spread', width: 24 },
        ],
        rows,
      },
      {
        name: 'Summary',
        preface: [
          ['Period', r.label],
          ['Currency', home],
          ['Income', round2(income)],
          ['Expenses', round2(expenses)],
          ['Left', round2(income - expenses)],
        ],
        columns: [
          { header: 'Category', width: 24 },
          { header: 'Type', width: 10 },
          { header: 'Entries', type: 'number', width: 9 },
          { header: `Total (${home})`, type: 'money', width: 15 },
          { header: 'Share', type: 'percent', width: 9 },
        ],
        rows: summaryRows,
      },
    ],
  };
}

/**
 * Exports the range as an Excel workbook (Transactions + Summary) and opens the share sheet
 * (Drive, email, Files…). Returns 'empty' without creating a file when nothing is in the range.
 */
export async function exportExcel(r: ExportRange): Promise<'exported' | 'empty'> {
  const { sheets, count } = buildWorkbook(r);
  if (count === 0) return 'empty';
  const bytes = buildXlsx(sheets);
  const name = `${APP_NAME.toLowerCase()}-${r.fileLabel}.xlsx`;
  if (Platform.OS === 'web') {
    downloadInBrowser(name, bytes, XLSX_MIME);
    return 'exported';
  }
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, dialogTitle: 'Export to Excel', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }
  return 'exported';
}
