import { ChevronLeft, ChevronRight, CircleDollarSign, Coins, Delete as Backspace, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Keypad, type KeypadKey } from '@/components/keypad';
import { CurrencySheet, EmojiSheet } from '@/components/pickers';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconButton } from '@/components/ui/icon-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { TextField } from '@/components/ui/text-field';
import { getDb } from '@/db/client';
import { createAccount, deleteAccount, setDefaultAccount, updateAccount } from '@/db/queries/accounts';
import { useAccountBalances } from '@/hooks/balances';
import { useMoney } from '@/hooks/ledger';
import { useOnOpen } from '@/hooks/use-on-open';
import { takeSnapshot } from '@/lib/backup';
import { evaluateExpression } from '@/lib/calculator';
import { currencyInfo } from '@/lib/currencies';
import { confirmAction, showAlert } from '@/lib/dialog';
import { CURRENCY_FORMATS } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { applyKey, renderExpr, trimAmount } from '@/lib/keypad-entry';
import { LIMITS, cleanIcon, cleanText } from '@/lib/validate';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C, F, fs } from '@/theme';
import type { Account } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Account to edit, or null to create one. */
  account: Account | null;
  /** Called after the account was deleted (e.g. to leave its page). */
  onDeleted?: () => void;
}

type Page = 'main' | 'balance';

/**
 * Create / edit an account, laid out like the reference: a large title, icon + name, a card with
 * Currency, Balance and Default account, and Save / Delete at the bottom. Balance opens a keypad
 * page (with Positive / Negative) inside the same sheet.
 */
export function AccountSheet({ visible, onClose, account, onDeleted }: Props) {
  const money = useMoney();
  const home = usePrefs((s) => s.homeCurrency);
  const fmt = usePrefs((s) => s.currencyFormat);
  const { balances } = useAccountBalances();
  const accounts = useData((s) => s.accounts);
  const transactions = useData((s) => s.transactions);

  const [page, setPage] = useState<Page>('main');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏦');
  const [currency, setCurrency] = useState(home);
  const [balance, setBalance] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [picker, setPicker] = useState<'emoji' | 'currency' | null>(null);
  // Balance keypad state.
  const [expr, setExpr] = useState('');
  const [negative, setNegative] = useState(false);

  useOnOpen(visible, () => {
    setPage('main');
    setName(account?.name ?? '');
    setIcon(account?.icon ?? '🏦');
    setCurrency(account?.currencyCode ?? home);
    setBalance(account ? Math.round((balances.get(account.id) ?? account.openingBalance) * 100) / 100 : 0);
    setIsDefault(account?.isDefault ?? accounts.length === 0);
    setPicker(null);
  });

  const openBalance = () => {
    setExpr(balance === 0 ? '' : trimAmount(Math.abs(balance)));
    setNegative(balance < 0);
    setPage('balance');
  };

  const applyBalance = () => {
    const v = evaluateExpression(expr || '0');
    if (v === null || v > LIMITS.maxAmount) {
      haptic.warn();
      return;
    }
    setBalance(negative ? -v : v);
    setPage('main');
  };

  const onKey = (k: KeypadKey) => {
    if (k === 'submit') return applyBalance();
    setExpr((prev) => applyKey(prev, k));
  };

  const save = async () => {
    const cleanName = cleanText(name, LIMITS.name);
    if (!cleanName) {
      showAlert('Name required', 'Give the account a name.');
      return;
    }
    const db = getDb();
    let id = account?.id;
    if (account) {
      // Keep history intact: shift the opening balance so the current balance matches.
      const current = balances.get(account.id) ?? account.openingBalance;
      const opening = account.openingBalance + (balance - current);
      await updateAccount(db, account.id, { name: cleanName, icon: cleanIcon(icon, '🏦'), color: account.color, currencyCode: currency, openingBalance: opening });
    } else {
      id = await createAccount(db, { name: cleanName, icon: cleanIcon(icon, '🏦'), color: '#EAB308', currencyCode: currency, openingBalance: balance });
    }
    if (id !== undefined && isDefault && !(account?.isDefault ?? false)) await setDefaultAccount(db, id);
    if (id !== undefined && !isDefault && account?.isDefault) {
      // Hand the default to the first other account.
      const other = accounts.find((a) => a.id !== id);
      if (other) await setDefaultAccount(db, other.id);
    }
    await useData.getState().reload();
    haptic.success();
    onClose();
  };

  const remove = () => {
    if (!account) return;
    const count = transactions.filter((t) => t.accountId === account.id).length;
    const parts = [
      count > 0 ? `This also deletes its ${count} transaction${count === 1 ? '' : 's'} and any transfers.` : null,
      accounts.length <= 1 ? 'It’s your only account, so a new empty “Main account” will be created.' : null,
      'You can undo this from Settings → Backup → Snapshots.',
    ];
    confirmAction({
      title: `Delete “${account.name}”?`,
      message: parts.filter(Boolean).join(' '),
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const db = getDb();
        await takeSnapshot(db);
        await deleteAccount(db, account.id, home);
        await useData.getState().reload();
        haptic.success();
        onClose();
        onDeleted?.();
      },
    });
  };

  const info = currencyInfo(currency);
  const onlyAccount = accounts.length <= 1 && !!account;

  return (
    <Sheet visible={visible} onClose={onClose} full contentStyle={styles.content}>
      {page === 'main' ? (
        <View style={styles.flex}>
          <T variant="title" style={styles.bigTitle}>
            {account ? 'Edit account' : 'New account'}
          </T>
          <View style={styles.nameRow}>
            <Pressable style={styles.iconButton} onPress={() => setPicker('emoji')} accessibilityRole="button" accessibilityLabel="Choose icon">
              <T style={{ fontSize: 26 }}>{icon}</T>
            </Pressable>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Account name"
              placeholderTextColor={C.text3}
              style={styles.nameInput}
              maxLength={LIMITS.name}
              autoFocus={!account}
              accessibilityLabel="Account name"
            />
          </View>

          <View style={styles.card}>
            <Row icon={<CircleDollarSign size={21} color={C.text2} />} label="Currency" value={info.code} onPress={() => setPicker('currency')} />
            <View style={styles.divider} />
            <Row icon={<Coins size={21} color={C.text2} />} label="Balance" value={money(balance, currency, { ignoreHide: true })} onPress={openBalance} />
            <View style={styles.divider} />
            <Row
              icon={<Star size={21} color={C.text2} />}
              label="Default account"
              right={<Toggle value={isDefault} onChange={setIsDefault} disabled={onlyAccount || (account?.isDefault ?? false) && accounts.length <= 1} accessibilityLabel="Default account" />}
            />
          </View>

          <View style={styles.flex} />
          <GradientButton label={account ? 'Save' : 'Add account'} onPress={save} variant="light" height={54} />
          {account ? (
            <PressableScale onPress={remove} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete account">
              <T variant="bodyMedium">Delete</T>
            </PressableScale>
          ) : null}
        </View>
      ) : (
        <View style={styles.flex}>
          <View style={styles.balanceHeader}>
            <IconButton accessibilityLabel="Back" onPress={() => setPage('main')} size={46}>
              <ChevronLeft size={24} color="#fff" />
            </IconButton>
            <T variant="heading" center style={styles.flex}>
              Balance
            </T>
            <View style={{ width: 46 }} />
          </View>
          <View style={styles.amountArea}>
            <View style={styles.amountRow}>
              <T style={styles.symbol}>
                {negative ? '−' : ''}
                {info.symbol}
              </T>
              <T style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
                {renderExpr(expr, fmt)}
              </T>
            </View>
            <Pressable
              style={styles.backspace}
              onPress={() => setExpr((p) => p.slice(0, -1))}
              onLongPress={() => setExpr('')}
              accessibilityLabel="Delete digit, hold to clear"
              hitSlop={10}>
              <Backspace size={28} color="#20262A" fill="#C9CCCF" strokeWidth={2.2} />
            </Pressable>
          </View>
          <View style={styles.signRow}>
            <Segmented<'pos' | 'neg'>
              value={negative ? 'neg' : 'pos'}
              onChange={(v) => setNegative(v === 'neg')}
              options={[
                { value: 'pos', label: 'Positive' },
                { value: 'neg', label: 'Negative' },
              ]}
            />
          </View>
          <View style={styles.keypad}>
            <Keypad onKey={onKey} decimalLabel={CURRENCY_FORMATS[fmt].decimal} calculator={false} pendingExpression={false} lightSubmit />
          </View>
        </View>
      )}

      <EmojiSheet visible={picker === 'emoji'} onClose={() => setPicker(null)} onSelect={setIcon} />
      <CurrencySheet visible={picker === 'currency'} onClose={() => setPicker(null)} value={currency} onSelect={setCurrency} showRates={false} title="Account currency" />
    </Sheet>
  );
}

function Row({ icon, label, value, onPress, right }: { icon: React.ReactNode; label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: 'rgba(255,255,255,0.04)' } : null]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}>
      <View style={styles.rowIcon}>{icon}</View>
      <T variant="body" style={styles.flex}>
        {label}
      </T>
      {right ?? (
        <View style={styles.rowValue}>
          <T variant="body" tone="secondary" numberOfLines={1}>
            {value}
          </T>
          <ChevronRight size={18} color={C.text3} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, paddingBottom: 4 },
  bigTitle: { fontSize: 30, lineHeight: 36, marginTop: 4, marginBottom: 20, marginLeft: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  nameInput: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: C.text,
    paddingHorizontal: 20,
    fontSize: fs(17),
    fontFamily: F.regular,
    outlineWidth: 0,
  },
  card: { marginTop: 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingHorizontal: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.divider },
  deleteButton: { marginTop: 10, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', marginTop: -4 },
  amountArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 48 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  symbol: { fontSize: 22, lineHeight: 28, color: C.text2, fontFamily: F.semiBold, marginTop: 8, marginRight: 4 },
  amount: { fontSize: 56, lineHeight: 68, color: C.text, fontFamily: F.semiBold, letterSpacing: -1 },
  backspace: { position: 'absolute', right: 4, top: '50%', marginTop: -14, width: 34, height: 28, alignItems: 'center', justifyContent: 'center' },
  signRow: { alignItems: 'center', marginBottom: 14 },
  keypad: { marginHorizontal: -16 },
});
