import { useMemo } from 'react';

import { useData } from '@/store/data';

/** Current balance of every account, in that account's own currency. */
export function useAccountBalances() {
  const accounts = useData((s) => s.accounts);
  const transactions = useData((s) => s.transactions);
  const transfers = useData((s) => s.transfers);
  const toHome = useData((s) => s.toHome);

  return useMemo(() => {
    const rate = (code: string) => toHome[code] ?? 1;
    // Converts `amount` in `from` into `to` via the home currency.
    const conv = (amount: number, from: string, to: string) => (from === to ? amount : (amount * rate(from)) / rate(to));
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const balances = new Map<number, number>(accounts.map((a) => [a.id, a.openingBalance]));

    for (const t of transactions) {
      const acct = byId.get(t.accountId);
      if (!acct) continue;
      const v = conv(t.amount, t.currencyCode, acct.currencyCode);
      balances.set(acct.id, (balances.get(acct.id) ?? 0) + (t.type === 'income' ? v : -v));
    }
    for (const tr of transfers) {
      const from = byId.get(tr.fromAccountId);
      const to = byId.get(tr.toAccountId);
      if (from) balances.set(from.id, (balances.get(from.id) ?? 0) - conv(tr.amount, tr.currencyCode, from.currencyCode));
      if (to) balances.set(to.id, (balances.get(to.id) ?? 0) + conv(tr.amount, tr.currencyCode, to.currencyCode));
    }

    let totalHome = 0;
    for (const a of accounts) totalHome += (balances.get(a.id) ?? 0) * rate(a.currencyCode);
    return { balances, totalHome };
  }, [accounts, transactions, transfers, toHome]);
}
