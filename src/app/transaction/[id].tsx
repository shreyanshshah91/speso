import { parseISO } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, CalendarRange, Delete, EllipsisVertical, LayoutGrid, RotateCw } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityFieldsSheet } from '@/components/activity-fields-sheet';
import { CategoryGridSheet } from '@/components/category-grid-sheet';
import { DateSheet } from '@/components/date-sheet';
import { Keypad, type KeypadKey } from '@/components/keypad';
import { NameSheet } from '@/components/name-sheet';
import { OptionsSheet } from '@/components/options-sheet';
import { CurrencySheet } from '@/components/pickers';
import { SpreadSheet, type SpreadValue } from '@/components/spread-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SheetHost } from '@/components/ui/sheet-host';
import { T } from '@/components/ui/text';
import { getDb } from '@/db/client';
import { advanceDate, createRecurringRule, runDueRecurringRules, updateRecurringRule } from '@/db/queries/recurring';
import { createTransaction, deleteTransaction, updateTransaction } from '@/db/queries/transactions';
import { useBudgetStatus } from '@/hooks/budget';
import { useMoney } from '@/hooks/ledger';
import { evaluateExpression } from '@/lib/calculator';
import { applyKey, renderExpr, trimAmount } from '@/lib/keypad-entry';
import { currencyInfo, flagEmoji } from '@/lib/currencies';
import { confirmAction, errorMessage, showAlert } from '@/lib/dialog';
import { CURRENCY_FORMATS, formatDateChip, toISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { formatSpreadRange } from '@/lib/spread';
import { LIMITS, cleanText, isValidISODate } from '@/lib/validate';
import { toHomeAmount, useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C, F, R } from '@/theme';
import type { RecurringFrequency, TransactionType } from '@/types';

type Repeat = RecurringFrequency | 'never';
type SheetName = 'fields' | 'repeat' | 'category' | 'date' | 'account' | 'name' | 'currency' | 'spread' | null;


export default function TransactionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, date: dateParam, categoryId: categoryParam, accountId: accountParam } = useLocalSearchParams<{
    id: string;
    date?: string;
    categoryId?: string;
    accountId?: string;
  }>();
  const isNew = id === 'new';
  const money = useMoney();

  const transactions = useData((s) => s.transactions);
  const categories = useData((s) => s.categories);
  const accounts = useData((s) => s.accounts);
  const recurring = useData((s) => s.recurring);
  const toHome = useData((s) => s.toHome);
  const home = usePrefs((s) => s.homeCurrency);
  const fmt = usePrefs((s) => s.currencyFormat);
  const fields = usePrefs((s) => s.fields);
  const budget = useBudgetStatus();

  const existing = useMemo(() => (isNew ? null : (transactions.find((t) => t.id === Number(id)) ?? null)), [isNew, id, transactions]);
  const existingRule = existing?.recurringRuleId ? recurring.find((r) => r.id === existing.recurringRuleId) : undefined;

  const presetCategory = categories.find((c) => c.id === Number(categoryParam));
  // New entries start on the first expense category, in the order set in Settings → Categories.
  const initialCategory =
    existing?.categoryId ??
    presetCategory?.id ??
    [...categories].filter((c) => c.type === 'expense').sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ??
    null;
  const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0];

  const [expr, setExpr] = useState(() => (existing ? trimAmount(existing.amount) : ''));
  const [categoryId, setCategoryId] = useState<number | null>(initialCategory);
  const [type, setType] = useState<TransactionType>(existing?.type ?? presetCategory?.type ?? 'expense');
  const [date, setDate] = useState(existing?.date ?? (isValidISODate(dateParam) ? dateParam : toISODate(new Date())));
  const presetAccount = accounts.find((a) => a.id === Number(accountParam));
  const [accountId, setAccountId] = useState<number | undefined>(existing?.accountId ?? presetAccount?.id ?? transactions[0]?.accountId ?? defaultAccount?.id);
  const [note, setNote] = useState(existing?.note ?? '');
  const [currency, setCurrency] = useState(existing?.currencyCode ?? home);
  const [repeat, setRepeat] = useState<Repeat>(existingRule?.active ? existingRule.frequency : 'never');
  const [spread, setSpread] = useState<SpreadValue>({
    months: existing?.spreadMonths ?? 1,
    from: existing?.spreadFrom ?? null,
    to: existing?.spreadTo ?? null,
  });
  const spreadRange = spread.from && spread.to ? { from: spread.from, to: spread.to } : null;
  const isSpread = spread.months > 1 || spreadRange !== null;
  const [sheet, setSheet] = useState<SheetName>(null);
  const saving = useRef(false);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const nudge = () => {
    haptic.warn();
    shake.set(withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 })));
  };

  // Same order as the category grid and Settings → Categories (drag to reorder there).
  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === type).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, type]
  );

  // Keep the selected category pill in view (e.g. after picking one from the grid).
  const catScrollRef = useRef<ScrollView>(null);
  const pillX = useRef(new Map<number, number>());
  useEffect(() => {
    if (categoryId === null) return;
    const x = pillX.current.get(categoryId);
    if (x !== undefined) catScrollRef.current?.scrollTo({ x: Math.max(0, x - 12), animated: true });
  }, [categoryId, typeCategories]);
  const category = categories.find((c) => c.id === categoryId);
  const account = accounts.find((a) => a.id === accountId);
  const decimal = CURRENCY_FORMATS[fmt].decimal;
  const pending = /[+\-×÷]/.test(expr.slice(1));
  const value = evaluateExpression(expr || '0') ?? 0;
  // The currency chip follows the "Currency converter" field. Turning it off returns a new entry to
  // the home currency; an existing foreign-currency entry keeps its chip so it isn't silently changed.
  const [prevConverter, setPrevConverter] = useState(fields.converter);
  if (prevConverter !== fields.converter) {
    setPrevConverter(fields.converter);
    if (!fields.converter && !existing) setCurrency(home);
  }
  const showConverter = fields.converter || (existing !== null && existing.currencyCode !== home);

  const nameSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of transactions) {
      if (t.categoryId !== categoryId || !t.note || seen.has(t.note)) continue;
      seen.add(t.note);
      out.push(t.note);
      if (out.length >= 8) break;
    }
    return out;
  }, [transactions, categoryId]);

  const budgetForCategory = budget.items.find((b) => b.categoryId === categoryId);

  const onKey = (k: KeypadKey) => {
    if (k === 'submit') {
      if (pending) {
        const r = evaluateExpression(expr);
        if (r === null || r < 0) return nudge();
        setExpr(trimAmount(r));
        return;
      }
      save();
      return;
    }
    setExpr((prev) => applyKey(prev, k));
  };

  const backspace = () => {
    haptic.tap();
    setExpr((p) => p.slice(0, -1));
  };

  // Android: the screen is a transparent modal that the app animates itself — it slides up on open,
  // follows the finger when dragged down from the top half (grabber, buttons, amount), and slides
  // away on close, revealing the tab beneath. Android's own screen animation is off, so closing
  // happens the moment the slide finishes, with no second animation. iOS keeps its native sheet.
  const customSheet = Platform.OS === 'android';
  const { height: screenH } = useWindowDimensions();
  const dragY = useSharedValue(customSheet ? screenH : 0);
  useEffect(() => {
    if (customSheet) dragY.set(withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [customSheet, dragY]);
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  /** Slides the screen away, then leaves it. */
  const close = useCallback(() => {
    if (!customSheet) return leave();
    dragY.set(
      withTiming(screenH, { duration: 230, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(leave)();
      })
    );
  }, [customSheet, dragY, screenH, leave]);
  // Only while this screen is in front: with Settings → Categories open on top it must not
  // take the back press (it used to, after a reload re-registered it, leaving an invisible screen
  // over the tabs until a second back press).
  useFocusEffect(
    useCallback(() => {
      if (!customSheet) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [customSheet, close])
  );
  const dismissPan = Gesture.Pan()
    .enabled(Platform.OS !== 'ios')
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      dragY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        const rest = Math.max(90, 230 * (1 - e.translationY / screenH));
        dragY.set(
          withTiming(screenH, { duration: rest, easing: Easing.in(Easing.quad) }, (finished) => {
            if (finished) runOnJS(leave)();
          })
        );
      } else {
        dragY.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
      }
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - Math.min(1, dragY.get() / screenH)) }));

  const save = async () => {
    if (saving.current) return;
    const amount = evaluateExpression(expr);
    if (amount === null || amount <= 0 || amount > LIMITS.maxAmount) return nudge();
    if (!category || !account) {
      showAlert(category ? 'Choose an account' : 'Choose a category');
      return;
    }
    saving.current = true;
    try {
      const db = getDb();
      const input = {
        amount: Math.round(amount * 100) / 100,
        currencyCode: currency,
        categoryId: category.id,
        accountId: account.id,
        type: category.type,
        note: cleanText(note, LIMITS.note),
        date,
        receiptUri: existing?.receiptUri ?? null,
        recurringRuleId: existing?.recurringRuleId ?? null,
        spreadMonths: spread.months,
        spreadFrom: spread.from,
        spreadTo: spread.to,
      };
      const nextRun = (f: RecurringFrequency) => toISODate(advanceDate(parseISO(date), f));
      const ruleFields = (f: RecurringFrequency) => ({
        amount: input.amount,
        currencyCode: input.currencyCode,
        categoryId: input.categoryId,
        accountId: input.accountId,
        type: input.type,
        note: input.note,
        frequency: f,
        dayOfPeriod: parseISO(date).getDate(),
        nextRunDate: nextRun(f),
      });

      await db.withTransactionAsync(async () => {
        if (!existing) {
          if (repeat !== 'never') input.recurringRuleId = await createRecurringRule(db, ruleFields(repeat));
          await createTransaction(db, input);
        } else {
          await updateTransaction(db, existing.id, input);
          if (existingRule) {
            if (repeat === 'never') await updateRecurringRule(db, existingRule.id, { active: false });
            else
              await updateRecurringRule(db, existingRule.id, {
                ...ruleFields(repeat),
                // Keep the schedule unless the frequency changed.
                nextRunDate: repeat === existingRule.frequency && existingRule.active ? existingRule.nextRunDate : nextRun(repeat),
                active: true,
              });
          } else if (repeat !== 'never') {
            const ruleId = await createRecurringRule(db, ruleFields(repeat));
            await db.runAsync('UPDATE transactions SET recurring_rule_id = ? WHERE id = ?', ruleId, existing.id);
          }
        }
      });
      // Back-dated repeating entries: generate any occurrences that are already due.
      if (repeat !== 'never') await runDueRecurringRules(db);
      await useData.getState().reload();
      haptic.success();
      close();
    } catch (e) {
      showAlert('Could not save', errorMessage(e));
    } finally {
      saving.current = false;
    }
  };

  const onMenu = (v: 'duplicate' | 'delete') => {
    setSheet(null);
    if (v === 'duplicate' && existing) {
      createTransaction(getDb(), { ...existing, date: toISODate(new Date()), recurringRuleId: null })
        .then(() => useData.getState().reload())
        .then(() => {
          haptic.success();
          close();
        })
        .catch((e) => showAlert('Could not duplicate', errorMessage(e)));
    }
    if (v === 'delete' && existing) {
      setTimeout(
        () =>
          confirmAction({
            title: 'Delete transaction?',
            message: 'This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
              await deleteTransaction(getDb(), existing.id);
              await useData.getState().reload();
              close();
            },
          }),
        250
      );
    }
  };


  const info = currencyInfo(currency);
  const displayAmount = renderExpr(expr, fmt);
  const homeValue = toHomeAmount(toHome, value, currency);

  return (
    <SheetHost>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dragBackdrop, backdropStyle]} />
    <Animated.View style={[styles.flex, dragStyle]}>
    <Screen padTop={false} style={{ paddingTop: Platform.OS === 'ios' ? 0 : insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
      <GestureDetector gesture={dismissPan}>
      <View style={styles.flex} collapsable={false}>
      <View style={styles.grabber} />
      <View style={styles.top}>
        <IconButton accessibilityLabel="Repeat" onPress={() => setSheet('repeat')} solid={repeat !== 'never' ? 'rgba(20,196,162,0.35)' : undefined}>
          <RotateCw size={20} color={repeat !== 'never' ? '#fff' : C.text2} />
        </IconButton>
        <View style={styles.topRight}>
          {showConverter ? (
            <Pressable style={styles.currencyChip} onPress={() => setSheet('currency')} accessibilityLabel={`Currency ${info.name}`}>
              <T style={{ fontSize: 18 }}>{flagEmoji(info.region)}</T>
              <T variant="body" tone="secondary">
                {info.symbol}
              </T>
            </Pressable>
          ) : null}
          <IconButton accessibilityLabel="More options" onPress={() => setSheet('fields')}>
            <EllipsisVertical size={20} color={C.text2} />
          </IconButton>
        </View>
      </View>

      {/* Amount */}
      <View style={styles.amountArea}>
        <Animated.View style={[styles.amountRow, shakeStyle]}>
          <View style={styles.amountCenter}>
            <T style={styles.symbol}>{info.symbol}</T>
            <T style={[styles.amount, !expr && { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`Amount ${displayAmount}`}>
              {displayAmount}
            </T>
          </View>
        </Animated.View>
        {currency !== home ? (
          <T variant="heading" tone="tertiary" center style={{ marginTop: 2 }}>
            {money(homeValue, home, { forceCents: true, ignoreHide: true })}
          </T>
        ) : null}
        <Pressable
          style={styles.backspace}
          onPress={backspace}
          onLongPress={() => {
            haptic.warn();
            setExpr('');
          }}
          accessibilityLabel="Delete digit, hold to clear"
          hitSlop={10}>
          <Delete size={28} color="#20262A" fill="#C9CCCF" strokeWidth={2.2} />
        </Pressable>
      </View>
      </View>
      </GestureDetector>

      {/* Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        <Chip onPress={() => setSheet('date')} icon={<Calendar size={18} color="#fff" />} label={formatDateChip(date)} />
        {fields.accounts && account ? <Chip onPress={() => setSheet('account')} icon={<T style={{ fontSize: 17 }}>{account.icon}</T>} label={account.name} /> : null}
        {fields.name ? <Chip onPress={() => setSheet('name')} icon={<T style={{ fontSize: 15 }}>🗒️</T>} label={note || 'Name'} dim={!note} /> : null}
        {/* Spreading is mostly for income (e.g. per diems); for expenses it's opt-in via ⋮. */}
        {type === 'income' || fields.spreadExpenses || isSpread ? (
          <Chip
            onPress={() => setSheet('spread')}
            icon={<CalendarRange size={18} color={isSpread ? '#fff' : C.text2} />}
            label={spreadRange ? `Spread · ${formatSpreadRange(spreadRange.from, spreadRange.to)}` : spread.months > 1 ? `Spread · ${spread.months} months` : 'Spread'}
            dim={!isSpread}
          />
        ) : null}
        {fields.budgets && budgetForCategory ? (
          <Chip
            onPress={() => router.push('/(tabs)/budget')}
            icon={<T style={{ fontSize: 15 }}>👛</T>}
            label={`${money(Math.abs(budgetForCategory.left - (isNew ? homeValue / spread.months : 0)))} ${budgetForCategory.left - (isNew ? homeValue / spread.months : 0) < 0 ? 'over' : 'left'}`}
          />
        ) : null}
      </ScrollView>

      {/* Category selector */}
      <View style={styles.catRow}>
        <View style={styles.catTrack}>
          <ScrollView ref={catScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {typeCategories.map((c) => {
              const on = c.id === categoryId;
              return (
                <PressableScale
                  key={c.id}
                  onLayout={(e) => {
                    pillX.current.set(c.id, e.nativeEvent.layout.x);
                    if (on) catScrollRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 12), animated: false });
                  }}
                  onPress={() => {
                    haptic.select();
                    setCategoryId(c.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  accessibilityState={{ selected: on }}
                  style={[styles.catPill, on && styles.catPillOn]}>
                  <T style={{ fontSize: 18 }}>{c.icon}</T>
                  <T variant="body" tone={on ? 'primary' : 'secondary'} style={{ fontSize: 17 }}>
                    {c.name}
                  </T>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
        <IconButton accessibilityLabel="Choose category" onPress={() => setSheet('category')} size={46}>
          <LayoutGrid size={20} color={C.text2} />
        </IconButton>
      </View>

      <Keypad onKey={onKey} decimalLabel={decimal} calculator={fields.calculator} pendingExpression={pending} />

      {/* Sheets */}
      <ActivityFieldsSheet
        visible={sheet === 'fields'}
        onClose={() => setSheet(null)}
        onDuplicate={existing ? () => onMenu('duplicate') : undefined}
        onDelete={existing ? () => onMenu('delete') : undefined}
      />
      <OptionsSheet<Repeat>
        visible={sheet === 'repeat'}
        onClose={() => setSheet(null)}
        title="Repeat"
        subtitle="Recurring transactions are added automatically on schedule"
        value={repeat}
        onSelect={setRepeat}
        options={[
          { value: 'never', label: 'Never' },
          { value: 'weekly', label: 'Every week' },
          { value: 'monthly', label: 'Every month' },
          { value: 'yearly', label: 'Every year' },
        ]}
      />
      <CategoryGridSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        selectedId={categoryId}
        initialType={type}
        onSelect={(cid, t) => {
          setCategoryId(cid);
          setType(t);
        }}
      />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} onChange={setDate} />
      <OptionsSheet<number | null>
        visible={sheet === 'account'}
        onClose={() => setSheet(null)}
        title="Account"
        value={accountId ?? null}
        onSelect={(v) => v !== null && setAccountId(v)}
        options={accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon }))}
      />
      <NameSheet visible={sheet === 'name'} onClose={() => setSheet(null)} value={note} suggestions={nameSuggestions} onChange={setNote} />
      <CurrencySheet visible={sheet === 'currency'} onClose={() => setSheet(null)} value={currency} onSelect={setCurrency} />
      <SpreadSheet
        visible={sheet === 'spread'}
        onClose={() => setSheet(null)}
        value={spread}
        onChange={setSpread}
        amount={value}
        currency={currency}
        date={date}
      />
    </Screen>
    </Animated.View>
    </SheetHost>
  );
}

function Chip({ icon, label, onPress, dim }: { icon: React.ReactNode; label: string; onPress: () => void; dim?: boolean }) {
  return (
    <PressableScale onPress={onPress} style={styles.chip} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <T variant="body" tone={dim ? 'secondary' : 'primary'} numberOfLines={1} style={{ maxWidth: 170 }}>
        {label}
      </T>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dragBackdrop: { backgroundColor: '#000' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 6 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  currencyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: C.pill },
  amountArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 60 },
  amountRow: { alignItems: 'center' },
  amountCenter: { flexDirection: 'row', alignItems: 'flex-start' },
  symbol: { fontSize: 22, lineHeight: 28, color: C.text2, fontFamily: F.semiBold, marginTop: 8, marginRight: 4 },
  amount: { fontSize: 64, lineHeight: 76, color: C.text, fontFamily: F.semiBold, letterSpacing: -1 },
  backspace: {
    position: 'absolute',
    right: 18,
    top: '50%',
    marginTop: -14,
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.pill },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  catTrack: { flex: 1, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', justifyContent: 'center' },
  catScroll: { paddingHorizontal: 3, gap: 2, alignItems: 'center' },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: R.pill },
  catPillOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
});
