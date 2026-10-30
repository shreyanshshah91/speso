import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CategoryFormSheet } from '@/components/category-form-sheet';
import { Empty } from '@/components/empty';
import { LedgerView } from '@/components/ledger-view';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useData } from '@/store/data';

/** One category's spending: tinted with its colour, with its own chart, filters and list. */
export default function CategoryScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const id = Number(categoryId);
  const category = useData((s) => s.categories.find((c) => c.id === id));
  const loaded = useData((s) => s.loaded);
  const [editing, setEditing] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/summary'));

  // If the category was deleted from the edit sheet, leave the page.
  useEffect(() => {
    if (loaded && !category) goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, category]);

  if (!category) {
    return (
      <Screen>
        <Empty emoji="🗂️" title="Category not found" />
      </Screen>
    );
  }

  return (
    <>
      <LedgerView
        scope="category"
        categoryId={category.id}
        topColor={category.color}
        barColor={category.color}
        title={category.name}
        typeMode="none"
        showCategories={false}
        fabHref={`/transaction/new?categoryId=${category.id}`}
        topBar={
          <View style={styles.bar}>
            <IconButton accessibilityLabel="Back" onPress={goBack}>
              <ChevronLeft size={24} color="#fff" strokeWidth={2.4} />
            </IconButton>
            <IconButton accessibilityLabel={`Edit ${category.name}`} onPress={() => setEditing(true)}>
              <Pencil size={19} color="#fff" />
            </IconButton>
          </View>
        }
      />
      <CategoryFormSheet visible={editing} onClose={() => setEditing(false)} type={category.type} category={category} />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, height: 56 },
});
