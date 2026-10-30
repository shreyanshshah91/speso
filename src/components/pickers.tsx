import { formatDistanceToNowStrict } from 'date-fns';
import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useOnOpen } from '@/hooks/use-on-open';
import { CURRENCIES, flagEmoji, type CurrencyInfo } from '@/lib/currencies';
import { looksLikeEmoji, searchEmojis } from '@/lib/emoji-data';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useData } from '@/store/data';
import { usePrefs } from '@/store/prefs';
import { C, F, PALETTE } from '@/theme';

interface EmojiProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

/** Emoji picker with keyword search ("car", "coffee", "rent"); a typed or pasted emoji can be
 * used directly as well. */
export function EmojiSheet({ visible, onClose, onSelect }: EmojiProps) {
  const [query, setQuery] = useState('');
  useOnOpen(visible, () => setQuery(''));
  const custom = looksLikeEmoji(query) ? query.trim() : null;
  const results = useMemo(() => (custom ? [] : searchEmojis(query)), [query, custom]);

  const pick = (e: string) => {
    haptic.select();
    onSelect(e);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Icon" tall>
      <View style={styles.searchWrap}>
        <Search size={20} color={C.text2} />
        <TextField
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => (custom ? pick(custom) : results[0] ? pick(results[0]) : undefined)}
          placeholder="Search emoji, or type your own"
          placeholderTextColor={C.text3}
          style={styles.searchInput}
          returnKeyType="done"
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={40}
          accessibilityLabel="Search emoji"
        />
      </View>
      {custom ? (
        <Pressable onPress={() => pick(custom)} style={styles.customRow} accessibilityRole="button" accessibilityLabel={`Use ${custom}`}>
          <T style={{ fontSize: 30 }}>{custom}</T>
          <T variant="body">Use this emoji</T>
        </Pressable>
      ) : results.length === 0 ? (
        <T variant="small" tone="secondary" center style={{ paddingVertical: 24 }}>
          No matches. Try another word, or switch to the emoji keyboard and type any emoji.
        </T>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(e) => e}
          numColumns={6}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => pick(item)} style={styles.emojiCell} accessibilityLabel={item}>
              <T style={styles.emoji}>{item}</T>
            </Pressable>
          )}
        />
      )}
    </Sheet>
  );
}

interface ColorProps {
  visible: boolean;
  onClose: () => void;
  value: string;
  onSelect: (color: string) => void;
}

export function ColorSheet({ visible, onClose, value, onSelect }: ColorProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Colour">
      <View style={styles.colors}>
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={`Colour ${c}`}
            onPress={() => {
              haptic.select();
              onSelect(c);
              onClose();
            }}
            style={[styles.swatchRing, value === c && { borderColor: '#fff' }]}>
            <View style={[styles.swatch, { backgroundColor: c }]} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

interface CurrencyListProps {
  value?: string;
  onSelect: (code: string) => void;
  /** Show each currency's value in the home currency. */
  showRates?: boolean;
  /** Called when the search field gains (true) or loses (false) focus. */
  onSearchFocus?: (focused: boolean) => void;
}

/** Searchable currency list (flag, symbol, name and optional rate in the home currency). */
export function CurrencyList({ value, onSelect, showRates = true, onSearchFocus }: CurrencyListProps) {
  const [q, setQ] = useState('');
  const toHome = useData((s) => s.toHome);
  const home = usePrefs((s) => s.homeCurrency);
  const fmt = usePrefs((s) => s.currencyFormat);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = query
      ? CURRENCIES.filter((c) => c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query))
      : CURRENCIES;
    const pin = value ?? home;
    return [...filtered].sort((a, b) => (a.code === pin ? -1 : b.code === pin ? 1 : 0));
    // Pin order only when the list opens, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, home]);

  const renderItem = ({ item, index }: { item: CurrencyInfo; index: number }) => {
    const rate = toHome[item.code];
    const selected = item.code === value;
    return (
      <Pressable
        onPress={() => {
          haptic.select();
          onSelect(item.code);
        }}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.curRow,
          index === 0 && styles.curFirst,
          index === list.length - 1 && styles.curLast,
          (pressed || selected) && { backgroundColor: 'rgba(255,255,255,0.10)' },
        ]}>
        <T style={{ fontSize: 20 }}>{flagEmoji(item.region)}</T>
        <T variant="body" tone="secondary" style={{ minWidth: 26 }}>
          {item.symbol}
        </T>
        <T variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {item.name}
        </T>
        {showRates && item.code !== home && rate ? (
          <T variant="body" style={{ color: C.blue }}>
            {formatMoney(rate, home, { cents: true, format: fmt, decimals: rate < 0.1 ? 4 : 2 })}
          </T>
        ) : null}
        {selected && !showRates ? <Check size={20} color={C.tealText} strokeWidth={2.6} /> : null}
      </Pressable>
    );
  };

  return (
    <>
      <View style={styles.searchWrap}>
        <Search size={20} color={C.text2} />
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder="Search currency"
          placeholderTextColor={C.text3}
          onFocus={() => onSearchFocus?.(true)}
          onBlur={() => onSearchFocus?.(false)}
          style={styles.searchInput}
          autoCorrect={false}
          maxLength={40}
          accessibilityLabel="Search currency"
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.code}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: 16 }}
        style={{ flexShrink: 1 }}
      />
    </>
  );
}

interface CurrencyProps {
  visible: boolean;
  onClose: () => void;
  value?: string;
  onSelect: (code: string) => void;
  showRates?: boolean;
  title?: string;
}

export function CurrencySheet({ visible, onClose, value, onSelect, showRates = true, title = 'Select currency' }: CurrencyProps) {
  const updatedAt = usePrefs((s) => s.ratesUpdatedAt);
  const subtitle = showRates
    ? updatedAt
      ? `Rates updated ${formatDistanceToNowStrict(new Date(updatedAt))} ago`
      : 'Rates not downloaded yet'
    : undefined;
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} tall>
      <CurrencyList
        value={value}
        showRates={showRates}
        onSelect={(code) => {
          onSelect(code);
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 64,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  // Explicit height: Android ignores aspectRatio in wrapped rows, which squashed the rows to the
  // text's line height and clipped the emoji.
  emojiCell: { flex: 1 / 6, height: 54, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28, lineHeight: 38, textAlign: 'center', includeFontPadding: false },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingBottom: 12 },
  swatchRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.regular, paddingVertical: 0, outlineWidth: 0 },
  curRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52, backgroundColor: 'rgba(255,255,255,0.05)' },
  curFirst: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  curLast: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.divider },
});
