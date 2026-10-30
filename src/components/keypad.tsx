import { ArrowRight, Equal } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { T } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { C, KEY_H } from '@/theme';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'dec' | '+' | '-' | '×' | '÷' | 'submit';

interface Props {
  onKey: (k: KeypadKey) => void;
  decimalLabel: string;
  calculator: boolean;
  /** Show "=" instead of the submit arrow (an expression is pending). */
  pendingExpression: boolean;
  /** Draw the submit key as a light button (e.g. the account balance editor). */
  lightSubmit?: boolean;
}

const OPS: Record<string, string> = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

export const Keypad = memo(function Keypad({ onKey, decimalLabel, calculator, pendingExpression, lightSubmit }: Props) {
  const rows: KeypadKey[][] = calculator
    ? [
        ['1', '2', '3', '÷'],
        ['4', '5', '6', '×'],
        ['7', '8', '9', '-'],
        ['dec', '0', '+', 'submit'],
      ]
    : [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['dec', '0', 'submit'],
      ];

  return (
    <View style={styles.pad}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((k) => {
            const isOp = k in OPS;
            const isSubmit = k === 'submit';
            return (
              <PressableScale
                key={k}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel={isSubmit ? (pendingExpression ? 'Calculate' : 'Save') : k === 'dec' ? 'Decimal' : k}
                onPress={() => {
                  haptic.tap();
                  onKey(k);
                }}
                style={[styles.key, isOp && styles.opKey, isSubmit && (lightSubmit ? styles.submitLight : styles.submitKey)]}>
                {isSubmit ? (
                  pendingExpression ? (
                    <Equal size={26} color="#fff" />
                  ) : (
                    <ArrowRight size={26} color={lightSubmit ? '#111416' : C.text2} strokeWidth={2.2} />
                  )
                ) : (
                  <T style={styles.keyText} tone={isOp ? 'teal' : 'primary'}>
                    {k === 'dec' ? decimalLabel : isOp ? OPS[k] : k}
                  </T>
                )}
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { gap: KEY_H < 54 ? 6 : 7, paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 7 },
  key: { flex: 1, height: KEY_H, borderRadius: 14, backgroundColor: C.key, alignItems: 'center', justifyContent: 'center' },
  opKey: { backgroundColor: 'rgba(20,196,162,0.12)' },
  submitKey: { backgroundColor: 'rgba(255,255,255,0.04)' },
  submitLight: { backgroundColor: '#E9EBEC', borderBottomWidth: 3, borderBottomColor: '#9EA3A7' },
  keyText: { fontSize: 28, lineHeight: 34, fontFamily: 'Outfit_500Medium' },
});
