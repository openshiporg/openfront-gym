import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireDashboardUser } from '@/features/dashboard/lib/current-user';
import { toPlainData } from '@/features/platform/lib/serialization';
import { getSchedulingWorkspaceData } from '../actions/scheduling';
import { SchedulingClient } from './SchedulingClient';
import { schedulingWorkspaceOptions } from '../lib/scope';

export async function SchedulingPage() {
  const user = await requireDashboardUser();
  const now = new Date();
  const start = startOfWeek(startOfMonth(now));
  const end = endOfWeek(endOfMonth(now));
  const { canManageWorkspace, isInstructorOnly, userId } = schedulingWorkspaceOptions(user);

  const workspace = await getSchedulingWorkspaceData(start, end, {
    userId,
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
        initialEvents={toPlainData(workspace.events) as any}
        schedules={toPlainData(workspace.schedules) as any}
        instructors={toPlainData(workspace.instructors) as any}
        classTypes={toPlainData(workspace.classTypes) as any}
        upcomingInstances={toPlainData(workspace.upcomingInstances) as any}
        locations={toPlainData(workspace.locations) as any}
        resources={toPlainData(workspace.resources) as any}
        timeZone={workspace.timeZone}
        isInstructor={isInstructorOnly}
        canManageWorkspace={canManageWorkspace}
      />
    </PageContainer>
  );
}

export default SchedulingPage;
