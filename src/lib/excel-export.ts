import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { downloadInBrowser } from '@/lib/download';
import { buildXlsx, XLSX_MIME, type XlsxColumn, type XlsxSheet } from '@/lib/xlsx';
import { toHomeAmount, useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { accountMoves } from '@/lib/running-balance';
import type { AccountTransfer, TransactionWithCategory } from '@/types';

/** The dates to export (inclusive, yyyy-MM-dd); null ends mean "from the start" / "to today". */
export interface ExportRange {
  from: string | null;
  to: string | null;
  /** "September 2026", "2026", "27 Aug – 22 Nov 2026", "All time". */
  label: string;
  /** For the file name: "2026-09", "2026", "2026-08-27_2026-11-22", "all-time". */
  fileLabel: string;
  /** Only this account's transactions and transfers (null = every account). */
  accountId?: number | null;
}

const inRange = (date: string, r: ExportRange) => (!r.from || date >= r.from) && (!r.to || date <= r.to);

/** Transactions (real entries, not spread shares) and transfers in the range, oldest first. */
export function entriesInRange(r: ExportRange): {
  transactions: TransactionWithCategory[];
  transfers: AccountTransfer[];
} {
  const { transactions, transfers } = useData.getState();
  const id = r.accountId ?? null;
  const byDate = <T extends { date: string; id: number }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
  return {
    transactions: transactions.filter((t) => inRange(t.date, r) && (id === null || t.accountId === id)).sort(byDate),
    transfers: transfers.filter((t) => inRange(t.date, r) && (id === null || t.fromAccountId === id || t.toAccountId === id)).sort(byDate),
  };
}

const TYPE_LABEL = { expense: 'Expense', income: 'Income' } as const;
const round2 = (v: number) => Math.round(v * 100) / 100;

function buildWorkbook(r: ExportRange): { sheets: XlsxSheet[]; count: number } {
  const { accounts, toHome } = useData.getState();
  const home = usePrefs.getState().homeCurrency;
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const { transactions, transfers } = entriesInRange(r);

  const account = r.accountId != null ? accounts.find((a) => a.id === r.accountId) : undefined;
  // Every amount and balance is in one currency, like a bank statement: the account's own for a
  // one-account export, the home currency otherwise.
  const cur = account ? account.currencyCode : home;

  interface Line {
    date: string;
    type: string;
    category: string | null;
    name: string | null;
    account: string | null;
    /** Signed effect in `cur`: negative = money out. */
    effect: number;
    balance: number;
    /** "USD 50.00" when the entry was in another currency than `cur`. */
    original: string | null;
    spread: string | null;
  }
  const original = (amount: number, code: string) => (code === cur ? null : `${code} ${amount.toFixed(2)}`);
  const txLine = (t: TransactionWithCategory, effect: number, balance: number): Line => ({
    date: t.date,
    type: TYPE_LABEL[t.type],
    category: t.categoryName,
    name: t.note || null,
    account: accountName.get(t.accountId) ?? null,
    effect,
    balance,
    original: original(t.amount, t.currencyCode),
    spread: t.spreadFrom && t.spreadTo ? `${t.spreadFrom} to ${t.spreadTo}` : t.spreadMonths > 1 ? `${t.spreadMonths} months` : null,
  });
  // A transfer is two lines in an all-accounts export (out of one, into the other), so the in and
  // out columns always add up to the change in balance.
  const transferLine = (tr: AccountTransfer, out: boolean, effect: number, balance: number): Line => {
    const other = accountName.get(out ? tr.toAccountId : tr.fromAccountId) ?? 'another account';
    const label = out ? `To ${other}` : `From ${other}`;
    return {
      date: tr.date,
      type: out ? 'Transfer out' : 'Transfer in',
      category: null,
      name: tr.note ? `${label} · ${tr.note}` : label,
      account: accountName.get(out ? tr.fromAccountId : tr.toAccountId) ?? null,
      effect,
      balance,
      original: original(tr.amount, tr.currencyCode),
      spread: null,
    };
  };

  // "Balance" is what was left right after each line: that account's balance for a one-account
  // export, or the total of every account otherwise. Both count everything before the range too,
  // so the first line continues from the real balance.
  const lines: Line[] = [];
  let opening = 0;
  let closing = 0;
  if (account) {
    const moves = accountMoves(account, useData.getState().transactions, useData.getState().transfers, toHome);
    const before = moves.filter((m) => r.from && m.date < r.from);
    opening = before.length ? before[before.length - 1].balance : account.openingBalance;
    closing = opening;
    for (const m of moves) {
      if (!inRange(m.date, r)) continue;
      lines.push(m.kind === 'tx' ? txLine(m.tx, m.effect, m.balance) : transferLine(m.transfer, m.out, m.effect, m.balance));
      closing = m.balance;
    }
  } else {
    const all = useData.getState();
    let total = accounts.reduce((sum, a) => sum + toHomeAmount(toHome, a.openingBalance, a.currencyCode), 0);
    const moves = [
      ...all.transactions.map((t) => ({ date: t.date, kind: 0, id: t.id, t, tr: null })),
      ...all.transfers.map((tr) => ({ date: tr.date, kind: 1, id: tr.id, t: null, tr })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind - b.kind || a.id - b.id));
    opening = total;
    for (const m of moves) {
      const effect = m.t && accountName.has(m.t.accountId) ? (m.t.type === 'income' ? 1 : -1) * toHomeAmount(toHome, m.t.amount, m.t.currencyCode) : 0;
      total += effect;
      if (r.from && m.date < r.from) opening = total;
      if (!inRange(m.date, r)) continue;
      if (m.t) lines.push(txLine(m.t, effect, total));
      else if (m.tr) {
        // Transfers move money between accounts, so they leave the total as it was.
        const v = toHomeAmount(toHome, m.tr.amount, m.tr.currencyCode);
        lines.push(transferLine(m.tr, true, -v, total), transferLine(m.tr, false, v, total));
      }
      closing = total;
    }
    if (lines.length === 0) closing = opening;
  }

  // Optional columns only appear when they'd say something.
  const showAccount = !account;
  const showOriginal = lines.some((l) => l.original);
  const showSpread = lines.some((l) => l.spread);
  const columns: XlsxColumn[] = [
    { header: 'Date', type: 'date', width: 12 },
    { header: 'Type', width: 12 },
    { header: 'Category', width: 20 },
    { header: 'Name', width: 30 },
    ...(showAccount ? [{ header: 'Account', width: 20 }] : []),
    { header: `Money out (${cur})`, type: 'money', width: 16 },
    { header: `Money in (${cur})`, type: 'money', width: 16 },
    { header: account ? `Balance (${cur})` : `Total balance (${cur})`, type: 'money', width: 18 },
    ...(showOriginal ? [{ header: 'Original amount', width: 16 }] : []),
    ...(showSpread ? [{ header: 'Spread', width: 24 }] : []),
  ];
  const rows = lines.map((l) => [
    l.date,
    l.type,
    l.category,
    l.name,
    ...(showAccount ? [l.account] : []),
    l.effect < 0 ? round2(-l.effect) : null,
    l.effect > 0 ? round2(l.effect) : null,
    round2(l.balance),
    ...(showOriginal ? [l.original] : []),
    ...(showSpread ? [l.spread] : []),
  ]);

  // Totals by category, in the home currency.
  const byCategory = new Map<string, { name: string; type: 'expense' | 'income'; count: number; total: number }>();
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    const v = toHomeAmount(toHome, t.amount, t.currencyCode);
    if (t.type === 'income') income += v;
    else expenses += v;
    const key = `${t.type}:${t.categoryId}`;
    const c = byCategory.get(key) ?? {
      name: t.categoryName,
      type: t.type,
      count: 0,
      total: 0,
    };
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
        columns,
        rows,
      },
      {
        name: 'Summary',
        preface: [
          ['Period', r.label],
          ['Account', account ? account.name : 'All accounts'],
          ['Currency', home],
          ['Income', round2(income)],
          ['Expenses', round2(expenses)],
          ['Left', round2(income - expenses)],
          [`Opening balance (${cur})`, round2(opening)],
          [`Closing balance (${cur})`, round2(closing)],
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
  const account = r.accountId != null ? useData.getState().accounts.find((a) => a.id === r.accountId) : undefined;
  const slug = account
    ? account.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : '';
  const name = `${APP_NAME.toLowerCase()}-${slug ? `${slug}-` : ''}${r.fileLabel}.xlsx`;
  if (Platform.OS === 'web') {
    downloadInBrowser(name, bytes, XLSX_MIME);
    return 'exported';
  }
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(file.uri, {
      mimeType: XLSX_MIME,
      dialogTitle: 'Export to Excel',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }
  return 'exported';
}
