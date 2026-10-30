import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { C, F, UI_SCALE } from '@/theme';

type Variant = 'hero' | 'title' | 'heading' | 'body' | 'bodyMedium' | 'label' | 'small' | 'caption' | 'tiny';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'red' | 'green' | 'teal' | 'dark';

const VARIANTS: Record<Variant, TextStyle> = {
  hero: { fontFamily: F.semiBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.5 },
  title: { fontFamily: F.semiBold, fontSize: 27, lineHeight: 33, letterSpacing: -0.3 },
  heading: { fontFamily: F.semiBold, fontSize: 19, lineHeight: 24 },
  body: { fontFamily: F.regular, fontSize: 17, lineHeight: 22 },
  bodyMedium: { fontFamily: F.medium, fontSize: 17, lineHeight: 22 },
  label: { fontFamily: F.medium, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: F.regular, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: F.regular, fontSize: 13, lineHeight: 17 },
  tiny: { fontFamily: F.medium, fontSize: 11, lineHeight: 14 },
};

const TONES: Record<Tone, string> = {
  primary: C.text,
  secondary: C.text2,
  tertiary: C.text3,
  red: C.red,
  green: C.green,
  teal: C.tealText,
  dark: '#111416',
};

export interface TProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: keyof typeof F;
  center?: boolean;
}

/** Scales font size and line height to the screen (see UI_SCALE); a no-op on the reference width. */
function fit(style: TextStyle): TextStyle {
  if (UI_SCALE === 1) return style;
  const out: TextStyle = { ...style };
  if (typeof style.fontSize === 'number') out.fontSize = Math.round(style.fontSize * UI_SCALE * 2) / 2;
  if (typeof style.lineHeight === 'number') out.lineHeight = Math.round(style.lineHeight * UI_SCALE);
  return out;
}

export function T({ variant = 'body', tone = 'primary', weight, center, style, ...rest }: TProps) {
  const flat = StyleSheet.flatten([
    VARIANTS[variant],
    { color: TONES[tone] },
    weight ? { fontFamily: F[weight] } : null,
    center ? { textAlign: 'center' as const } : null,
    style,
  ]);
  // System font size is honoured up to 1.25x; beyond that dense rows and charts stop fitting.
  return <Text allowFontScaling maxFontSizeMultiplier={1.25} {...rest} style={fit(flat)} />;
}
