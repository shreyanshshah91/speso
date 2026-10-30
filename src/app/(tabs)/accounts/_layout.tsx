import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { C } from '@/theme';

/** Accounts tab stack: the account list, and a page per account pushed on top (tab bar stays). */
export default function AccountsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bgBottom }, animation: Platform.OS === 'android' ? 'ios_from_right' : 'slide_from_right' }} />;
}
