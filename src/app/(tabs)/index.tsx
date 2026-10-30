import { LedgerView } from '@/components/ledger-view';
import { TopBar } from '@/components/top-bar';

export default function ActivityScreen() {
  return <LedgerView scope="activity" topBar={<TopBar />} tint="blue" typeMode="activity" showCategories />;
}
