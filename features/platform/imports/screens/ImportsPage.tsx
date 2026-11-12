import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformHeader } from '@/features/platform/components/platform-ui';
import { ImportsClient } from './ImportsClient';
import { requireDashboardRole } from '@/features/platform/lib/current-user';

export default async function ImportsPage() {
  await requireDashboardRole((role) => Boolean(role.canManagePeople));
  const header = (
    <PlatformHeader
      eyebrow="Gym management"
      title="Contact imports"
      description="Preview up to 100 contacts, resolve identity conflicts, then import. Memberships and payments are never created by an import."
    />
  );
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Members', href: '/dashboard/platform/members' },
    { type: 'page' as const, label: 'Contact imports' },
  ];
  return <PageContainer title="Contact imports" header={header} breadcrumbs={breadcrumbs}><ImportsClient /></PageContainer>;
}
