import { addMonths, addYears, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateSheet } from '@/components/date-sheet';
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

/** "Export to Excel": pick a month, a year, a date range or everything, then share the .xlsx. */
export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('month');
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
    setBusy(false);
  });

  const range = useMemo<ExportRange>(() => {
    const now = new Date();
    if (mode === 'month') {
      const m = addMonths(startOfMonth(now), step);
      return { from: toISODate(m), to: toISODate(endOfMonth(m)), label: format(m, 'MMMM yyyy'), fileLabel: format(m, 'yyyy-MM') };
    }
    if (mode === 'year') {
      const y = addYears(now, step).getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), fileLabel: String(y) };
    }
    if (mode === 'custom') {
      const [a, b] = from <= to ? [from, to] : [to, from];
      const fa = parseISO(a);
      const fb = parseISO(b);
      const label = `${format(fa, fa.getFullYear() === fb.getFullYear() ? 'd MMM' : 'd MMM yyyy')} – ${format(fb, 'd MMM yyyy')}`;
      return { from: a, to: b, label, fileLabel: `${a}_${b}` };
    }
    return { from: null, to: null, label: 'All time', fileLabel: 'all-time' };
  }, [mode, step, from, to]);

  const counts = useMemo(() => {
    const e = entriesInRange(range);
    return { transactions: e.transactions.length, transfers: e.transfers.length };
    // The store arrays are listed so the count follows new or deleted entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, transactions, transfers]);
  const total = counts.transactions + counts.transfers;

  const run = async () => {
    if (busy) return;
    if (total === 0) {
      haptic.warn();
      showAlert('Nothing to export', `There are no transactions in ${range.label}. Pick another period.`);
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
      <Sheet visible={visible} onClose={onClose} title="Export to Excel" subtitle="Your transactions plus a summary by category, as an Excel file you can save or send.">
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
});
