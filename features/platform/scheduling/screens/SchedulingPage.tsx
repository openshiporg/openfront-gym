import { addDays, endOfDay, format, startOfMonth, startOfWeek } from 'date-fns';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformHeader } from '@/features/platform/components/platform-ui';
import { requireDashboardUser } from '@/features/platform/lib/current-user';
import { toPlainData } from '@/features/platform/lib/serialization';
import { getSchedulingWorkspaceData } from '../actions/scheduling';
import { SchedulingClient } from './SchedulingClient';
import { schedulingWorkspaceOptions } from '../lib/scope';

/** Six calendar weeks always cover a full month grid and a 14-day agenda. */
const WINDOW_DAYS = 42;

function parseDay(value?: string | string[]) {
  const text = Array.isArray(value) ? value[0] : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function SchedulingPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const user = await requireDashboardUser();
  const params = searchParams ? await searchParams : {};
  const requested = parseDay(params.from);
  const windowStart = startOfWeek(requested ?? startOfMonth(new Date()));
  const windowEnd = addDays(windowStart, WINDOW_DAYS - 1);
  const { canManageWorkspace, isInstructorOnly, userId } = schedulingWorkspaceOptions(user);

  // Pad a day on each side so gym-local days at the edges survive the server/gym offset.
  const workspace = await getSchedulingWorkspaceData(addDays(windowStart, -1), addDays(endOfDay(windowEnd), 1), {
    userId,
    isInstructorOnly,
  });

  const header = (
    <PlatformHeader
      eyebrow="Class operations"
      title="Scheduling"
      description={
        isInstructorOnly
          ? 'Your teaching calendar. Open any session to review its roster.'
          : 'Run recurring templates, dated sessions, capacity, and instructor assignments from one calendar.'
      }
    />
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
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
        loadedWindow={{ from: format(windowStart, 'yyyy-MM-dd'), to: format(windowEnd, 'yyyy-MM-dd') }}
        windowComplete={workspace.eventsComplete !== false}
        truncatedOptions={workspace.truncated}
        initialDate={requested ? format(requested, 'yyyy-MM-dd') : undefined}
      />
    </PageContainer>
  );
}

export default SchedulingPage;
