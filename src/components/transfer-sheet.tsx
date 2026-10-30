import { ArrowDown, CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { DateSheet } from '@/components/date-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { GradientButton } from '@/components/ui/gradient-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { getDb } from '@/db/client';
import { createTransfer, updateTransfer } from '@/db/queries/transfers';
import { useOnOpen } from '@/hooks/use-on-open';
import { removeTransfer } from '@/lib/actions';
import { amountToInput, parseAmountInput } from '@/lib/amount-input';
import { currencySymbol } from '@/lib/currencies';
import { confirmAction, showAlert } from '@/lib/dialog';
import { formatDateChip, toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { LIMITS, cleanText } from '@/lib/validate';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C, F } from '@/theme';
import type { AccountTransfer } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** An existing transfer to edit; leave out to make a new one. */
  transfer?: AccountTransfer | null;
}

export function TransferSheet({ visible, onClose, transfer = null }: Props) {
  const accounts = useData((s) => s.accounts);
  const fmt = usePrefs((s) => s.currencyFormat);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [pick, setPick] = useState<'from' | 'to' | 'date' | null>(null);
  // Kept from the moment the sheet opens, so the sheet doesn't flip to "new" while closing.
  const [editing, setEditing] = useState<AccountTransfer | null>(null);

  useOnOpen(visible, () => {
    setEditing(transfer);
    setFromId(transfer?.fromAccountId ?? accounts[0]?.id ?? null);
    setToId(transfer?.toAccountId ?? accounts[1]?.id ?? null);
    setAmount(transfer ? amountToInput(transfer.amount, fmt) : '');
    setNote(transfer?.note ?? '');
    setDate(transfer?.date ?? toISODate(new Date()));
  });

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  // An edited transfer keeps its currency unless it now leaves from a different account.
  const currencyCode = editing && from?.id === editing.fromAccountId ? editing.currencyCode : from?.currencyCode;

  const save = async () => {
    const value = parseAmountInput(amount, fmt);
    if (!from || !to || from.id === to.id) {
      showAlert('Choose two different accounts');
      return;
    }
    if (!value || value > LIMITS.maxAmount) {
      showAlert('Enter an amount');
      return;
    }
    const input = {
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: value,
      currencyCode: currencyCode ?? from.currencyCode,
      date,
      note: cleanText(note, LIMITS.note),
    };
    if (editing) await updateTransfer(getDb(), editing.id, input);
    else await createTransfer(getDb(), input);
    await useData.getState().reload();
    haptic.success();
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    confirmAction({
      title: 'Delete transfer?',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await removeTransfer(editing.id);
        haptic.success();
        onClose();
      },
    });
  };

  const options = accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon }));

  return (
    <Sheet visible={visible} onClose={onClose} title={editing ? 'Edit transfer' : 'Transfer'}>
      {accounts.length < 2 ? (
        <T variant="body" tone="secondary" center style={{ paddingVertical: 24 }}>
          Add a second account to move money between accounts.
        </T>
      ) : (
        <>
          <Pressable style={styles.field} onPress={() => setPick('from')}>
            <T variant="body" tone="secondary">
              From
            </T>
            <T variant="body">
              {from?.icon} {from?.name}
            </T>
          </Pressable>
          <View style={styles.arrow}>
            <ArrowDown size={18} color={C.text2} />
          </View>
          <Pressable style={styles.field} onPress={() => setPick('to')}>
            <T variant="body" tone="secondary">
              To
            </T>
            <T variant="body">
              {to?.icon} {to?.name}
            </T>
          </Pressable>
          <View style={[styles.field, { marginTop: 10 }]}>
            <T variant="body" tone="secondary">
              Amount ({currencySymbol(currencyCode ?? 'USD')})
            </T>
            <TextField
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={C.text3}
              style={styles.amount}
              maxLength={16}
              autoFocus={!editing}
            />
          </View>
          <Pressable
            style={[styles.field, { marginTop: 10 }]}
            onPress={() => {
              Keyboard.dismiss();
              setPick('date');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Date: ${formatDateChip(date)}, change`}>
            <T variant="body" tone="secondary">
              Date
            </T>
            <View style={styles.dateValue}>
              <CalendarDays size={17} color={C.text2} />
              <T variant="body">{formatDateChip(date)}</T>
            </View>
          </Pressable>
          <TextField
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={C.text3}
            style={[styles.field, styles.note]}
            maxLength={LIMITS.note}
          />
          <View style={{ marginTop: 16 }}>
            <GradientButton label={editing ? 'Save' : 'Transfer'} onPress={save} variant="light" height={52} />
          </View>
          {editing ? (
            <PressableScale onPress={remove} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete transfer">
              <T variant="bodyMedium">Delete</T>
            </PressableScale>
          ) : null}
        </>
      )}
      <OptionsSheet<number | null>
        visible={pick === 'from' || pick === 'to'}
        onClose={() => setPick(null)}
        title={pick === 'from' ? 'From account' : 'To account'}
        options={options}
        value={pick === 'from' ? fromId : toId}
        onSelect={(v) => (pick === 'from' ? setFromId(v) : setToId(v))}
      />
      <DateSheet visible={pick === 'date'} onClose={() => setPick(null)} value={date} onChange={setDate} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: { alignItems: 'center', paddingVertical: 4 },
  deleteButton: { marginTop: 10, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  dateValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { flex: 1, textAlign: 'right', color: C.text, fontSize: 18, fontFamily: F.medium, paddingVertical: 0, outlineWidth: 0, marginLeft: 12 },
  note: { marginTop: 10, color: C.text, fontSize: 17, fontFamily: F.regular, outlineWidth: 0 },
});
