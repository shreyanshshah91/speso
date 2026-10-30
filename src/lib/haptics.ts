import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePrefs } from '@/store/prefs';

const enabled = () => Platform.OS !== 'web' && usePrefs.getState().haptics;

export const haptic = {
  tap() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  select() {
    if (enabled()) Haptics.selectionAsync().catch(() => undefined);
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  warn() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
};
