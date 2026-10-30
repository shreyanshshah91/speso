import { Calculator, CalendarClock, CalendarRange, Copy, Landmark, NotebookText, Trash2, Wallet } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { usePrefs, type ActivityFields } from '@/store/prefs';
import { C } from '@/theme';

const ROWS: { key: keyof ActivityFields; label: string; Icon: typeof Wallet }[] = [
  { key: 'name', label: 'Name', Icon: NotebookText },
  { key: 'accounts', label: 'Accounts', Icon: Landmark },
  { key: 'converter', label: 'Currency converter', Icon: CalendarClock },
  { key: 'budgets', label: 'Budgets', Icon: Wallet },
  { key: 'calculator', label: 'Calculator', Icon: Calculator },
  { key: 'spreadExpenses', label: 'Spread for expenses', Icon: CalendarRange },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When editing an existing transaction: duplicate / delete actions shown under the toggles. */
  onDuplicate?: () => void;
  onDelete?: () => void;
}

/** The ⋮ menu of the add-transaction screen: which optional fields to show, plus actions when
 * editing an existing transaction. */
export function ActivityFieldsSheet({ visible, onClose, onDuplicate, onDelete }: Props) {
  const fields = usePrefs((s) => s.fields);
  const set = usePrefs((s) => s.set);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Activity fields"
      subtitle="Select which activity fields you want to display in the transaction screen">
      <View style={{ gap: 8, paddingBottom: 4 }}>
        {ROWS.map(({ key, label, Icon }) => (
          <View key={key} style={styles.row}>
            <Icon size={22} color={C.text2} />
            <T variant="body" style={{ flex: 1 }}>
              {label}
            </T>
            <Toggle value={fields[key]} onChange={(v) => set('fields', { ...fields, [key]: v })} accessibilityLabel={label} />
          </View>
        ))}
        {onDuplicate ? (
          <Pressable style={[styles.row, styles.action]} onPress={onDuplicate} accessibilityRole="button" accessibilityLabel="Duplicate to today">
            <Copy size={22} color={C.text2} />
            <T variant="body" style={{ flex: 1 }}>
              Duplicate to today
            </T>
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable style={[styles.row, styles.action]} onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete transaction">
            <Trash2 size={22} color={C.red} />
            <T variant="body" tone="red" style={{ flex: 1 }}>
              Delete transaction
            </T>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  action: { marginTop: 0 },
});
