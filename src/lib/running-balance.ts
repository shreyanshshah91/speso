import type { Account, AccountTransfer, TransactionWithCategory } from '@/types';

/** A transaction or transfer on one account, with the account's balance right after it. */
export type AccountMove =
  | {
      kind: 'tx';
      date: string;
      id: number;
      tx: TransactionWithCategory;
      effect: number;
      balance: number;
    }
  | {
      kind: 'transfer';
      date: string;
      id: number;
      transfer: AccountTransfer;
      out: boolean;
      effect: number;
      balance: number;
    };

/**
 * Every entry on `account`, oldest first, with its signed effect and the running balance in the
 * account's currency (opening balance + everything up to and including it). Within a day,
 * transactions come before transfers, each by id, so exports and the account page agree.
 */
export function accountMoves(account: Account, transactions: TransactionWithCategory[], transfers: AccountTransfer[], toHome: Record<string, number>): AccountMove[] {
  const rate = (code: string) => toHome[code] ?? 1;
  const toAccount = (amount: number, code: string) => (code === account.currencyCode ? amount : (amount * rate(code)) / rate(account.currencyCode));
  const moves: AccountMove[] = [];
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    const v = toAccount(t.amount, t.currencyCode);
    moves.push({
      kind: 'tx',
      date: t.date,
      id: t.id,
      tx: t,
      effect: t.type === 'income' ? v : -v,
      balance: 0,
    });
  }
  for (const tr of transfers) {
    const out = tr.fromAccountId === account.id;
    if (!out && tr.toAccountId !== account.id) continue;
    const v = toAccount(tr.amount, tr.currencyCode);
    moves.push({
      kind: 'transfer',
      date: tr.date,
      id: tr.id,
      transfer: tr,
      out,
      effect: out ? -v : v,
      balance: 0,
    });
  }
  moves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind !== b.kind ? (a.kind === 'tx' ? -1 : 1) : a.id - b.id));
  let balance = account.openingBalance;
  for (const m of moves) {
    balance += m.effect;
    m.balance = balance;
  }
  return moves;
}
