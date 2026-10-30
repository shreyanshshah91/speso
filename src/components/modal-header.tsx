import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { T } from '@/components/ui/text';

/** Header for modal screens: glass close button, centred title, optional right action. */
export function ModalHeader({ title, right, onClose }: { title: string; right?: React.ReactNode; onClose?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <IconButton accessibilityLabel="Close" onPress={onClose ?? (() => router.back())} size={42}>
        <X size={22} color="#fff" strokeWidth={2.4} />
      </IconButton>
      <T variant="heading" center style={styles.title} numberOfLines={1}>
        {title}
      </T>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  title: { flex: 1 },
  right: { width: 42, alignItems: 'flex-end' },
});
