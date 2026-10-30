import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/theme';

interface Props {
  icon: string;
  color?: string;
  size?: number;
  /** Coloured outline (Summary list) instead of a plain tile (Activity list). */
  outlined?: boolean;
}

export function CategoryIcon({ icon, color, size = 64, outlined }: Props) {
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.3 },
        outlined ? { borderWidth: 1.8, borderColor: color ?? C.text3, backgroundColor: 'rgba(255,255,255,0.03)' } : null,
      ]}>
      <Text style={{ fontSize: size * 0.5 }} allowFontScaling={false}>
        {icon}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
});
