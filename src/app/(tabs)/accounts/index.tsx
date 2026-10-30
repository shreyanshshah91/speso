import { useRouter } from 'expo-router';
import { Menu, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountSheet } from '@/components/account-sheet';
import { CategoryIcon } from '@/components/category-icon';
import { AddFab } from '@/components/fab';
import { OptionsSheet } from '@/components/options-sheet';
import { SortableList } from '@/components/sortable-list';
import { TopBar } from '@/components/top-bar';
import { TransferSheet } from '@/components/transfer-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { T } from '@/components/ui/text';
import { getDb } from '@/db/client';
import { reorderAccounts } from '@/db/queries/accounts';
import { useAccountBalances } from '@/hooks/balances';
import { useMoney } from '@/hooks/ledger';
import { useTabBarInsets } from '@/hooks/tab-bar';
import { useData } from '@/store/data';
import { C, R } from '@/theme';

const ROW_H = 78;

export default function AccountsScreen() {
  const router = useRouter();
  const { contentPadding: tabSpace } = useTabBarInsets();
  const money = useMoney();
  const accounts = useData((s) => s.accounts);
  const { balances, totalHome } = useAccountBalances();
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transfer, setTransfer] = useState(false);

  const onReorder = async (keys: string[]) => {
    await reorderAccounts(getDb(), keys.map(Number));
    await useData.getState().reload();
  };

  return (
    <Screen>
      <TopBar
        right={
          <IconButton accessibilityLabel="Add account or transfer" onPress={() => setMenu(true)}>
            <Plus size={24} color="#fff" />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <T variant="body" tone="secondary">
            Total balance
          </T>
          <T variant="hero" style={{ fontSize: 38, lineHeight: 46 }} adjustsFontSizeToFit numberOfLines={1}>
            {money(totalHome)}
          </T>
        </View>

        <View style={styles.list}>
          <SortableList
            itemHeight={ROW_H}
            onReorder={onReorder}
            items={accounts.map((a) => ({
              key: String(a.id),
              render: (Handle) => (
                <Pressable
                  style={styles.row}
                  onPress={() => router.push(`/accounts/${a.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}, ${money(balances.get(a.id) ?? 0, a.currencyCode)}`}>
                  <CategoryIcon icon={a.icon} size={46} />
                  <View style={{ flex: 1 }}>
                    <T variant="body" tone="secondary" numberOfLines={1}>
                      {a.name}
                    </T>
                    <T variant="heading" numberOfLines={1} style={{ fontSize: 20 }}>
                      {money(balances.get(a.id) ?? 0, a.currencyCode)}
                    </T>
                  </View>
                  <Handle>
                    <View style={styles.handle} accessibilityLabel="Drag to reorder">
                      <Menu size={22} color={C.text2} />
                    </View>
                  </Handle>
                </Pressable>
              ),
            }))}
          />
        </View>
      </ScrollView>
      <AddFab />

      <OptionsSheet<string>
        visible={menu}
        onClose={() => setMenu(false)}
        title="Add"
        value=""
        onSelect={(v) => (v === 'account' ? setCreating(true) : setTransfer(true))}
        options={[
          { value: 'account', label: 'New account', icon: '🏦' },
          { value: 'transfer', label: 'Transfer between accounts', icon: '↔️' },
        ]}
      />
      <AccountSheet visible={creating} account={null} onClose={() => setCreating(false)} />
      <TransferSheet visible={transfer} onClose={() => setTransfer(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 4, marginBottom: 22 },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: ROW_H - 10,
    paddingHorizontal: 10,
    borderRadius: R.xl,
    backgroundColor: C.cardStrong,
  },
  handle: { padding: 10 },
});
