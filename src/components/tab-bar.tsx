import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { AccountsIcon, ActivityIcon, AnalyticsIcon, BudgetIcon, SummaryIcon } from '@/components/icons';
import { Glass } from '@/components/ui/glass';
import { T } from '@/components/ui/text';
import { TAB_BAR_H, useTabBarInsets } from '@/hooks/tab-bar';
import { haptic } from '@/lib/haptics';
import { C, F, TAB_BAR_SIDE, fs, sz } from '@/theme';

const TABS: Record<string, { label: string; Icon: typeof ActivityIcon }> = {
  index: { label: 'Activity', Icon: ActivityIcon },
  summary: { label: 'Summary', Icon: SummaryIcon },
  budget: { label: 'Budget', Icon: BudgetIcon },
  analytics: { label: 'Analytics', Icon: AnalyticsIcon },
  accounts: { label: 'Accounts', Icon: AccountsIcon },
};

const BAR_PAD = 4;
const BAR_H = TAB_BAR_H;
const ICON = sz(23);
const LABEL_FS = fs(12);
const MOTION = { duration: 280, easing: Easing.out(Easing.cubic) };

/**
 * Floating glass tab bar. The active tab sits in a dark pill that hugs its icon and label; all
 * tabs are spaced evenly. Every width is computed from the measured bar and label sizes (no layout
 * animations), so the bar can't overflow or drop a tab on narrow screens, and the pill and tabs
 * glide to their new widths together.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom } = useTabBarInsets();
  // Width of the bar's inner area (the row is inset from the bar by BAR_PAD on every side).
  const [barW, setBarW] = useState(0);
  const [labelW, setLabelW] = useState<Record<string, number>>({});

  const routes = state.routes.filter((r) => TABS[r.name]);
  const activeName = state.routes[state.index]?.name;
  const n = Math.max(routes.length, 1);
  const inner = barW;

  // Even spacing: every tab gets its content width plus the same margin on each side, and the
  // pill fills the active tab — so the pill's inner padding equals the gap to the next label, on
  // every screen width. Labels not yet measured are estimated from their length.
  const content = routes.map((r) => Math.max(ICON, labelW[r.name] ?? TABS[r.name].label.length * LABEL_FS * 0.58));
  const total = content.reduce((a, b) => a + b, 0);
  const margin = Math.max(0, inner - total) / (2 * n);
  // Very large text on a tiny screen: shrink every slot proportionally (labels then scale to fit).
  const squeeze = total > inner && total > 0 ? inner / total : 1;
  const widths = content.map((c) => c * squeeze + margin * 2);
  const activeIndex = routes.findIndex((r) => r.name === activeName);
  const activeW = activeIndex >= 0 ? widths[activeIndex] : 0;
  // Clamped so the pill can never poke past the bar's inner edge, whatever the rounding.
  const pillX = Math.min(widths.slice(0, Math.max(0, activeIndex)).reduce((a, b) => a + b, 0), inner - activeW);

  const pillW = useGlide(barW > 0 ? activeW : -1);
  const pillLeft = useGlide(barW > 0 ? pillX : -1);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillW.get() < 0 ? 0 : 1,
    width: Math.max(0, pillW.get()),
    transform: [{ translateX: Math.max(0, pillLeft.get()) }],
  }));

  const onMeasure = (name: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setLabelW((prev) => (prev[name] === w ? prev : { ...prev, [name]: w }));
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottom, paddingHorizontal: TAB_BAR_SIDE }]}>
      {/* Android: fade the content out behind the navigation buttons so the bar reads cleanly. */}
      {Platform.OS === 'android' ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(17,21,24,0)', 'rgba(17,21,24,0.94)']}
          locations={[0, 0.55]}
          style={[styles.scrim, { height: bottom + BAR_H * 0.7 }]}
        />
      ) : null}
      {/* Invisible, unconstrained copies of the labels in the active weight, used to size the pill. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {routes.map((r) => (
          <T key={r.key} onLayout={onMeasure(r.name)} style={styles.measureText} maxFontSizeMultiplier={1.15}>
            {TABS[r.name].label}
          </T>
        ))}
      </View>
      <Glass style={styles.bar} intensity={40} tint="rgba(24,27,30,0.6)" fill="rgba(25,28,31,0.97)">
        <View style={styles.row} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
          {activeIndex >= 0 ? <Animated.View style={[styles.pill, pillStyle]} /> : null}
          {routes.map((route, i) => {
            const meta = TABS[route.name];
            const focused = route.name === activeName;
            return (
              <Tab
                key={route.key}
                width={barW > 0 ? widths[i] : -1}
                label={meta.label}
                Icon={meta.Icon}
                focused={focused}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    haptic.select();
                    navigation.navigate(route.name, route.params);
                  }
                }}
              />
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

function Tab({
  width,
  label,
  Icon,
  focused,
  onPress,
}: {
  /** Target width, or -1 before the bar has been measured (tabs then share the width evenly). */
  width: number;
  label: string;
  Icon: typeof ActivityIcon;
  focused: boolean;
  onPress: () => void;
}) {
  const w = useGlide(width);
  const style = useAnimatedStyle(() => (w.get() < 0 ? { flex: 1 } : { width: w.get() }));
  return (
    <Animated.View style={style}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} onPress={onPress} style={styles.tab}>
        <Icon size={ICON} filled={focused} />
        <T
          variant="caption"
          weight={focused ? 'semiBold' : 'medium'}
          style={styles.label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={1.15}>
          {label}
        </T>
      </Pressable>
    </Animated.View>
  );
}

/**
 * A shared value that follows `target`: it jumps on the first real value (so nothing animates in
 * from zero on launch) and glides on later changes. -1 means "not measured yet".
 */
function useGlide(target: number): SharedValue<number> {
  const v = useSharedValue(target);
  useEffect(() => {
    if (target < 0 || v.get() < 0) v.set(target);
    else v.set(withTiming(target, MOTION));
  }, [target, v]);
  return v;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { borderRadius: 32, height: BAR_H },
  // Inset with margin (not padding) so the absolutely placed pill measures from the same edge on
  // every platform: an equal BAR_PAD gap on all four sides.
  row: { flex: 1, flexDirection: 'row', margin: BAR_PAD, alignItems: 'stretch' },
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: (BAR_H - BAR_PAD * 2) / 2,
    backgroundColor: C.tabActive,
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  label: { fontSize: 12, lineHeight: 15, color: C.text },
  measure: { position: 'absolute', left: 0, top: 0, alignItems: 'flex-start', opacity: 0 },
  measureText: { fontFamily: F.semiBold, fontSize: 12, lineHeight: 15, flexShrink: 0 },
});
