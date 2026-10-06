import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireDashboardUser } from '@/features/dashboard/lib/current-user';
import { loadOperations } from './actions';
import { OperationsClient } from './OperationsClient';

export async function OperationsPage() {
  await requireDashboardUser();
  const data = await loadOperations();
  return <PageContainer title="Operations follow-up" header={<h1 className="text-2xl font-semibold">Operations follow-up</h1>}>
    <OperationsClient data={data} />
  </PageContainer>;
}
