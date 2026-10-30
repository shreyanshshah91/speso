import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Rect, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from 'react-native-svg';

import { APP_NAME } from '@/constants/app';
import { F } from '@/theme';

const LOGO = require('../../assets/images/logo.png');
// Same art and size as the native splash (imageWidth 190), so the hand-off is seamless.
const LOGO_SIZE = 190;
const HOLD_MS = 1100;

/**
 * Opaque launch screen (same colour as the native splash so there's no flash): an even dark
 * backdrop with the logo and the app name, which then fades away to reveal the app.
 */
export function LaunchOverlay() {
  const { width, height } = useWindowDimensions();
  const [done, setDone] = useState(false);
  const fade = useSharedValue(1);
  const logo = useSharedValue(0);

  useEffect(() => {
    logo.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    fade.set(
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) }, (finished) => {
          if (finished) runOnJS(setDone)(true);
        })
      )
    );
    // Safety net in case the animation callback never fires.
    const t = setTimeout(() => setDone(true), HOLD_MS + 1200);
    return () => clearTimeout(t);
  }, [fade, logo]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.get(),
    transform: [{ scale: 0.9 + 0.1 * logo.get() }],
  }));

  if (done) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, containerStyle]} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Even, subtle vertical shade: no bright spot. */}
          <SvgLinearGradient id="launch-bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#15232A" />
            <Stop offset="1" stopColor="#0B1418" />
          </SvgLinearGradient>
          <SvgLinearGradient id="launch-word" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E7F2F1" />
            <Stop offset="1" stopColor="#6FB9AD" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#launch-bg)" />
        <SvgText
          x={width / 2}
          y={height / 2 + LOGO_SIZE * 0.42 + 62}
          fill="url(#launch-word)"
          fontSize={46}
          fontFamily={F.semiBold}
          textAnchor="middle"
          letterSpacing={1}>
          {APP_NAME}
        </SvgText>
      </Svg>
      <View style={styles.center}>
        <Animated.View style={logoStyle}>
          <Image source={LOGO} style={{ width: LOGO_SIZE, height: LOGO_SIZE }} contentFit="contain" accessibilityLabel={`${APP_NAME} logo`} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0E1A20', ...(Platform.OS === 'web' ? { zIndex: 5000 } : { elevation: 5000 }) },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
