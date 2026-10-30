import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sz } from '@/theme';

/** Height of the floating tab bar. */
export const TAB_BAR_H = sz(62);

/**
 * Where the floating tab bar sits. On iOS it may overlap the home indicator a little, like the
 * reference; on Android it stays clear above the navigation buttons or gesture bar.
 * - `bottom`: gap between the screen's bottom edge and the bar
 * - `top`: distance from the screen's bottom edge to the top of the bar
 * - `contentPadding`: bottom padding for scrolling tab screens so the last row clears the bar and +
 */
export function useTabBarInsets() {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? Math.max(insets.bottom - 8, 10) : insets.bottom + 10;
  const top = bottom + TAB_BAR_H;
  return { bottom, top, contentPadding: top + 76 };
}
