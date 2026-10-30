import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SettingsIcon } from '@/components/icons';
import { IconButton } from '@/components/ui/icon-button';

/** Top row of every tab: settings button on the left, optional action on the right. */
export function TopBar({ right }: { right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <IconButton accessibilityLabel="Settings" onPress={() => router.push('/settings')} size={42}>
        <SettingsIcon size={22} />
      </IconButton>
      <View>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    height: 56,
  },
});
