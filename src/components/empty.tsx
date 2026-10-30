import { StyleSheet, View } from 'react-native';

import { T } from '@/components/ui/text';

export function Empty({ emoji, title, message }: { emoji: string; title: string; message?: string }) {
  return (
    <View style={styles.wrap}>
      <T style={{ fontSize: 40 }}>{emoji}</T>
      <T variant="bodyMedium" center style={{ marginTop: 10 }}>
        {title}
      </T>
      {message ? (
        <T variant="small" tone="secondary" center style={{ marginTop: 4 }}>
          {message}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
});
