import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { SheetHost } from '@/components/ui/sheet-host';
import { C } from '@/theme';

export default function TabsLayout() {
  return (
    <SheetHost>
      <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bgBottom }, animation: 'fade' }}
      tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Activity' }} />
      <Tabs.Screen name="summary" options={{ title: 'Summary' }} />
      <Tabs.Screen name="budget" options={{ title: 'Budget' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts' }} />
      </Tabs>
    </SheetHost>
  );
}
