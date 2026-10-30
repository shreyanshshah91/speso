import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { C } from '@/theme';

/** Summary tab stack: the category ring, and a page per category pushed on top (tab bar stays). */
export default function SummaryLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bgBottom }, animation: Platform.OS === 'android' ? 'ios_from_right' : 'slide_from_right' }} />;
}
