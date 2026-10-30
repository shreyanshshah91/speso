import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { SheetHost } from '@/components/ui/sheet-host';

import { C } from '@/theme';

export default function SettingsLayout() {
  return (
    <SheetHost>
      {/* Sub-pages glide in from the right; on Android with the iOS-style parallax slide. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bgBottom },
          animation: Platform.OS === 'android' ? 'ios_from_right' : 'slide_from_right',
        }}
      />
    </SheetHost>
  );
}
