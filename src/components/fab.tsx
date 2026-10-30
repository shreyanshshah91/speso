import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { haptic } from '@/lib/haptics';
import { C } from '@/theme';

/** The light round "+" button floating above the tab bar that opens the add-transaction sheet. */
export function AddFab({ href = '/transaction/new' }: { href?: string }) {
  const router = useRouter();
  const { top } = useTabBarInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: top + 14 }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => {
          haptic.tap();
          router.push(href as never);
        }}
        style={styles.fab}>
        <Plus size={24} color="#1B1F22" strokeWidth={2.2} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.fab,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
