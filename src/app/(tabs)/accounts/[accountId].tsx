import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Pencil } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { AccountSheet } from '@/components/account-sheet';
import { Empty } from '@/components/empty';
import { AddFab } from '@/components/fab';
import { TransferSheet } from '@/components/transfer-sheet';
import { TxRow } from '@/components/tx-row';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { useAccountBalances } from '@/hooks/balances';
import { useMoney } from '@/hooks/ledger';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { formatDayHeader } from '@/lib/format';
import { useData } from '@/store/data';
import type { AccountTransfer } from '@/types';

interface Entry {
  key: string;
  date: string;
  icon: string;
  title: string;
  subtitle?: string;
  /** Amount in the entry's own currency (for display) … */
  amount: number;
  currency: string;
  /** … and its signed effect on this account, in the account's currency (for day totals). */
  effect: number;
  tone: 'primary' | 'green' | 'secondary';
  sign: '' | '+' | '−';
  txId?: number;
  transfer?: AccountTransfer;
  recurring?: boolean;
}

interface Section {
  key: string;
  title: string;
  total: number;
  data: Entry[];
}

/** One account: its current balance and every transaction and transfer on it, newest first. */
export default function AccountScreen() {
  const router = useRouter();
  const { contentPadding: tabSpace } = useTabBarInsets();
  const money = useMoney();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const id = Number(accountId);
  const account = useData((s) => s.accounts.find((a) => a.id === id));
  const accounts = useData((s) => s.accounts);
  const transactions = useData((s) => s.transactions);
  const transfers = useData((s) => s.transfers);
  const toHome = useData((s) => s.toHome);
  const loaded = useData((s) => s.loaded);
  const { balances } = useAccountBalances();
  const [editing, setEditing] = useState(false);
  const [editTransfer, setEditTransfer] = useState<AccountTransfer | null>(null);
  // Show the header and balance straight away and fill in the list just after, so the page slides
  // in without waiting for every row to render.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/accounts'));

  // If the account disappears (deleted from the edit sheet), leave the page.
  useEffect(() => {
    if (loaded && !account) goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, account]);

  const sections = useMemo<Section[]>(() => {
    if (!account) return [];
    const rate = (code: string) => toHome[code] ?? 1;
    const toAccount = (amount: number, code: string) => (code === account.currencyCode ? amount : (amount * rate(code)) / rate(account.currencyCode));
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    const entries: Entry[] = [];

    // Real entries (not monthly shares): an account shows money on the day it moved.
    for (const t of transactions) {
      if (t.accountId !== account.id) continue;
      const income = t.type === 'income';
      entries.push({
        key: `t${t.id}`,
        date: t.date,
        icon: t.categoryIcon,
        title: t.note || t.categoryName,
        amount: t.amount,
        currency: t.currencyCode,
        effect: (income ? 1 : -1) * toAccount(t.amount, t.currencyCode),
        tone: income ? 'green' : 'primary',
        sign: income ? '+' : '',
        txId: t.id,
        recurring: t.recurringRuleId !== null,
      });
    }
    for (const tr of transfers) {
      const out = tr.fromAccountId === account.id;
      if (!out && tr.toAccountId !== account.id) continue;
      const other = names.get(out ? tr.toAccountId : tr.fromAccountId) ?? 'another account';
      entries.push({
        key: `x${tr.id}`,
        date: tr.date,
        icon: '↔️',
        title: out ? `To ${other}` : `From ${other}`,
        subtitle: tr.note || 'Transfer',
        amount: tr.amount,
        currency: tr.currencyCode,
        effect: (out ? -1 : 1) * toAccount(tr.amount, tr.currencyCode),
        tone: 'secondary',
        sign: out ? '−' : '+',
        transfer: tr,
      });
    }

    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.key.localeCompare(a.key)));
    const byDay = new Map<string, Section>();
    for (const e of entries) {
      let s = byDay.get(e.date);
      if (!s) {
        s = { key: e.date, title: formatDayHeader(e.date), total: 0, data: [] };
        byDay.set(e.date, s);
      }
      s.total += e.effect;
      s.data.push(e);
    }
    return [...byDay.values()];
  }, [account, accounts, transactions, transfers, toHome]);

  if (!account) return <Screen />;

  const balance = balances.get(account.id) ?? account.openingBalance;

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton accessibilityLabel="Back" onPress={goBack} size={46}>
          <ChevronLeft size={24} color="#fff" />
        </IconButton>
        <T variant="heading" center numberOfLines={1} style={styles.title}>
          {account.icon} {account.name}
        </T>
        <IconButton accessibilityLabel="Edit account" onPress={() => setEditing(true)} size={46} solid="rgba(80,88,94,0.6)">
          <Pencil size={19} color="#fff" />
        </IconButton>
      </View>

      <SectionList
        sections={ready ? sections : []}
        keyExtractor={(e) => e.key}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        ListHeaderComponent={
          <View style={styles.header}>
            <T variant="body" tone="secondary">
              Current balance
            </T>
            <T variant="hero" style={styles.hero} adjustsFontSizeToFit numberOfLines={1}>
              {money(balance, account.currencyCode)}
            </T>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <T variant="body" tone="secondary" style={styles.dayHeaderText}>
              {section.title}
            </T>
            <T variant="body" tone="secondary" style={styles.dayHeaderText}>
              {money(section.total, account.currencyCode, { signed: true })}
            </T>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TxRow
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            amount={`${item.sign}${money(item.amount, item.currency)}`}
            amountTone={item.tone}
            recurring={item.recurring}
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={
              item.txId !== undefined
                ? () => router.push(`/transaction/${item.txId}`)
                : item.transfer
                  ? () => setEditTransfer(item.transfer ?? null)
                  : undefined
            }
          />
        )}
        ListEmptyComponent={ready ? <Empty emoji="🏦" title="No transactions yet" message="Entries you add to this account show up here." /> : null}
      />
      <AddFab href={`/transaction/new?accountId=${account.id}`} />
      <TransferSheet visible={editTransfer !== null} transfer={editTransfer} onClose={() => setEditTransfer(null)} />
      <AccountSheet visible={editing} account={account} onClose={() => setEditing(false)} onDeleted={goBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  title: { flex: 1 },
  header: { alignItems: 'center', marginTop: 14, marginBottom: 18 },
  hero: { fontSize: 42, lineHeight: 50, maxWidth: '90%' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  dayHeaderText: { fontSize: 16 },
});
