import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireDashboardUser } from '@/features/dashboard/lib/current-user';
import { getSchedulingWorkspaceData } from '../actions/scheduling';
import { SchedulingClient } from './SchedulingClient';

export async function SchedulingPage() {
  const user = await requireDashboardUser();
  const now = new Date();
  const start = startOfWeek(startOfMonth(now));
  const end = endOfWeek(endOfMonth(now));
  const canManageWorkspace = Boolean(user.role?.canManageAllRecords);
  const isInstructorOnly = Boolean(user.role?.isInstructor && !canManageWorkspace);

  const workspace = await getSchedulingWorkspaceData(start, end, {
    userId: user.id,
    isInstructorOnly,
  });

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Scheduling Command Center</h1>
      <p className="text-muted-foreground">
        {isInstructorOnly
          ? 'Review your teaching calendar and move into rosters quickly.'
          : 'Monitor class capacity and instructor availability'}
      </p>
    </div>
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Scheduling' }
  ];

  return (
    <PageContainer title="Scheduling" header={header} breadcrumbs={breadcrumbs}>
      <SchedulingClient
        initialEvents={workspace.events as any}
        schedules={workspace.schedules as any}
        instructors={workspace.instructors as any}
        upcomingInstances={workspace.upcomingInstances as any}
        isInstructor={isInstructorOnly}
        canManageWorkspace={canManageWorkspace}
      />
    </PageContainer>
  );
}

export default SchedulingPage;
