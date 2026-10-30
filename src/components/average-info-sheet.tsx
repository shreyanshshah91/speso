import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { GradientButton } from '@/components/ui/gradient-button';
import { Sheet } from '@/components/ui/sheet';
import { T } from '@/components/ui/text';

/** Explains the dashed average line on the spending chart. */
export function AverageInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Svg width={52} height={40} viewBox="0 0 52 40">
          <Line x1={2} y1={20} x2={50} y2={20} stroke="#FFFFFF" strokeWidth={3} strokeDasharray="5 4" strokeLinecap="round" />
          <Path d="M8 8 C 18 8, 22 32, 32 32 S 44 24, 46 24" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" />
        </Svg>
        <T variant="heading" center style={styles.title}>
          How the average works
        </T>
        <T variant="body" tone="secondary" center style={styles.text}>
          It’s the total of the transactions in this period divided by the number of bars on the chart. Days (or months) that
          haven’t happened yet are left out, so an unfinished month isn’t diluted.
        </T>
      </View>
      <GradientButton label="Got it" variant="light" height={54} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: 6, paddingBottom: 26, paddingHorizontal: 8 },
  title: { marginTop: 14 },
  text: { marginTop: 10, fontSize: 16, lineHeight: 23 },
});
