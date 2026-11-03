import { addMonths, addYears, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateSheet } from '@/components/date-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { useOnOpen } from '@/hooks/use-on-open';
import { showAlert, errorMessage } from '@/lib/dialog';
import { entriesInRange, exportExcel, type ExportRange } from '@/lib/excel-export';
import { toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { C } from '@/theme';

type Mode = 'month' | 'year' | 'custom' | 'all';

/**
 * "Export to Excel": pick a month, a year, a date range or everything, and one account or all of
 * them, then share the .xlsx. `accountId` preselects an account (from an account's page).
 */
export function ExportSheet({ visible, onClose, accountId = null }: { visible: boolean; onClose: () => void; accountId?: number | null }) {
  const [mode, setMode] = useState<Mode>('month');
  const [account, setAccount] = useState<number | null>(accountId);
  const [pickingAccount, setPickingAccount] = useState(false);
  const accounts = useData((s) => s.accounts);
  const [step, setStep] = useState(0); // months or years back from the current one
  const today = toISODate(new Date());
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(today);
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [busy, setBusy] = useState(false);
  // Recount when the data changes while the sheet is open.
  const transactions = useData((s) => s.transactions);
  const transfers = useData((s) => s.transfers);

  useOnOpen(visible, () => {
    setStep(0);
    setAccount(accountId);
    setBusy(false);
  });

  // Falls back to "All accounts" if the chosen one was deleted.
  const chosen = accounts.find((a) => a.id === account) ?? null;
  const accountIdOrNull = chosen?.id ?? null;
  const range = useMemo<ExportRange>(() => {
    const now = new Date();
    const r = ((): Omit<ExportRange, 'accountId'> => {
      if (mode === 'month') {
        const m = addMonths(startOfMonth(now), step);
        return {
          from: toISODate(m),
          to: toISODate(endOfMonth(m)),
          label: format(m, 'MMMM yyyy'),
          fileLabel: format(m, 'yyyy-MM'),
        };
      }
      if (mode === 'year') {
        const y = addYears(now, step).getFullYear();
        return {
          from: `${y}-01-01`,
          to: `${y}-12-31`,
          label: String(y),
          fileLabel: String(y),
        };
      }
      if (mode === 'custom') {
        const [a, b] = from <= to ? [from, to] : [to, from];
        const fa = parseISO(a);
        const fb = parseISO(b);
        const label = `${format(fa, fa.getFullYear() === fb.getFullYear() ? 'd MMM' : 'd MMM yyyy')} – ${format(fb, 'd MMM yyyy')}`;
        return { from: a, to: b, label, fileLabel: `${a}_${b}` };
      }
      return { from: null, to: null, label: 'All time', fileLabel: 'all-time' };
    })();
    return { ...r, accountId: accountIdOrNull };
  }, [mode, step, from, to, accountIdOrNull]);

  const counts = useMemo(() => {
    const e = entriesInRange(range);
    return {
      transactions: e.transactions.length,
      transfers: e.transfers.length,
    };
    // The store arrays are listed so the count follows new or deleted entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, transactions, transfers]);
  const total = counts.transactions + counts.transfers;

  const run = async () => {
    if (busy) return;
    if (total === 0) {
      haptic.warn();
      showAlert('Nothing to export', `There are no transactions${chosen ? ` on ${chosen.name}` : ''} in ${range.label}. Pick another period${chosen ? ' or account' : ''}.`);
      return;
    }
    setBusy(true);
    try {
      await exportExcel(range);
      onClose();
    } catch (e) {
      showAlert('Export failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const summary =
    total === 0
      ? `No transactions in ${range.label}`
      : [
          `${counts.transactions} ${counts.transactions === 1 ? 'transaction' : 'transactions'}`,
          counts.transfers > 0 ? `${counts.transfers} ${counts.transfers === 1 ? 'transfer' : 'transfers'}` : null,
        ]
          .filter(Boolean)
          .join(' and ');

  const field = (which: 'from' | 'to', value: string) => (
    <Pressable style={styles.field} onPress={() => setEditing(which)} accessibilityRole="button" accessibilityLabel={which === 'from' ? 'From date' : 'To date'}>
      <T variant="caption" tone="secondary">
        {which === 'from' ? 'From' : 'To'}
      </T>
      <T variant="body">{format(parseISO(value), 'd MMM yyyy')}</T>
    </Pressable>
  );

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Export to Excel"
        subtitle="Your transactions with the balance after each one, plus a summary by category, as an Excel file you can save or send.">
        <Pressable style={styles.accountField} onPress={() => setPickingAccount(true)} accessibilityRole="button" accessibilityLabel="Account">
          <T variant="body" tone="secondary">
            Account
          </T>
          <T variant="body" numberOfLines={1} style={styles.accountName}>
            {chosen ? `${chosen.icon} ${chosen.name}` : 'All accounts'}
          </T>
          <ChevronDown size={18} color={C.text2} />
        </Pressable>
        <Segmented<Mode>
          fill
          value={mode}
          onChange={(m) => {
            setMode(m);
            setStep(0);
          }}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
            { value: 'custom', label: 'Dates' },
            { value: 'all', label: 'All' },
          ]}
        />
        <View style={styles.picker}>
          {mode === 'month' || mode === 'year' ? (
            <View style={styles.stepper}>
              <IconButton accessibilityLabel={mode === 'month' ? 'Previous month' : 'Previous year'} onPress={() => setStep((v) => v - 1)} size={44}>
                <ChevronLeft size={22} color="#fff" />
              </IconButton>
              <T variant="heading" center style={styles.stepLabel}>
                {range.label}
              </T>
              {/* Dimmed on the current month / year: there's nothing later to export. */}
              <View style={step >= 0 ? { opacity: 0.35 } : undefined}>
                <IconButton accessibilityLabel={mode === 'month' ? 'Next month' : 'Next year'} onPress={() => setStep((v) => Math.min(0, v + 1))} size={44}>
                  <ChevronRight size={22} color="#fff" />
                </IconButton>
              </View>
            </View>
          ) : mode === 'custom' ? (
            <View style={styles.fields}>
              {field('from', from)}
              {field('to', to)}
            </View>
          ) : (
            <T variant="heading" center style={styles.stepLabel}>
              All time
            </T>
          )}
          <T variant="body" tone={total === 0 ? 'secondary' : 'primary'} center style={styles.count}>
            {summary}
          </T>
        </View>
        <GradientButton label={busy ? 'Preparing…' : 'Export to Excel'} onPress={run} disabled={busy} variant="light" height={52} />
      </Sheet>
      <OptionsSheet<number | null>
        visible={pickingAccount}
        onClose={() => setPickingAccount(false)}
        title="Account"
        value={accountIdOrNull}
        onSelect={setAccount}
        options={[
          { value: null, label: 'All accounts', icon: '🏦' },
          ...accounts.map((a) => ({
            value: a.id,
            label: a.name,
            icon: a.icon,
          })),
        ]}
      />
      <DateSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        value={editing === 'from' ? from : to}
        onChange={(iso) => (editing === 'from' ? setFrom(iso) : setTo(iso))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  picker: { paddingVertical: 18, gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLabel: { flex: 1 },
  fields: { flexDirection: 'row', gap: 8 },
  field: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  count: { color: C.text },
  accountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  accountName: { flex: 1, textAlign: 'right' },
});
