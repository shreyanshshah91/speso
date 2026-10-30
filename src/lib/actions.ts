import { getDb } from '@/db/client';
import { createTransaction, deleteTransaction } from '@/db/queries/transactions';
import { deleteTransfer } from '@/db/queries/transfers';
import { useData } from '@/store/data';
import type { Transaction } from '@/types';

/** Thin write helpers: every mutation goes to SQLite, then the in-memory ledger reloads. */
export async function removeTransaction(id: number) {
  await deleteTransaction(getDb(), id);
  await useData.getState().reload();
}

export async function duplicateTransaction(t: Transaction, date: string) {
  // Copy the real entry, not a monthly share of a spread one.
  const source = useData.getState().transactions.find((x) => x.id === t.id) ?? t;
  const { amount, currencyCode, categoryId, accountId, type, note, receiptUri, spreadMonths, spreadFrom, spreadTo } = source;
  await createTransaction(getDb(), { amount, currencyCode, categoryId, accountId, type, note, receiptUri, spreadMonths, spreadFrom, spreadTo, date, recurringRuleId: null });
  await useData.getState().reload();
}

export async function removeTransfer(id: number) {
  await deleteTransfer(getDb(), id);
  await useData.getState().reload();
}

export async function reloadData() {
  await useData.getState().reload();
}
