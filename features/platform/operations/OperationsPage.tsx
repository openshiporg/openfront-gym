import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireDashboardUser } from '@/features/platform/lib/current-user';
import { PlatformHeader } from '@/features/platform/components/platform-ui';
import { loadOperations } from './actions';
import { firstParam } from '@/features/platform/lib/search-params';
import { OperationsClient } from './OperationsClient';

export async function OperationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  await requireDashboardUser();
  const raw = searchParams ? await searchParams : {};
  const number = (name: string) => Number(firstParam(raw[name])) || 0;
  const data = await loadOperations(false, undefined, undefined, {
    noticeSkip: number('noticeSkip'), eventSkip: number('eventSkip'), resourceSkip: number('resourceSkip'),
    credentialScope: firstParam(raw.credentials) === 'history' ? 'history' : 'active', credentialSkip: number('credentialSkip'),
    memberQuery: firstParam(raw.memberQuery, 100),
  });
  const header = (
    <PlatformHeader
      eyebrow="Manager queues"
      title="Operations follow-up"
      description="Resolve member notices, waiver verification, safety closures, privacy reviews, and financial exceptions. Nothing here messages members or charges payment methods automatically."
    />
  );
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Operations follow-up' },
  ];
  return <PageContainer title="Operations follow-up" header={header} breadcrumbs={breadcrumbs}>
    <OperationsClient data={data} />
  </PageContainer>;
}
