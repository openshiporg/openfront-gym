import { getCalendarEvents } from '../actions/scheduling';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { SchedulingClient } from './SchedulingClient';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

export async function SchedulingPage() {
  const now = new Date();
  const start = startOfWeek(startOfMonth(now));
  const end = endOfWeek(endOfMonth(now));

  const response = await getCalendarEvents(start, end);
  const events = response.success ? response.data : [];

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Scheduling Command Center</h1>
      <p className="text-muted-foreground">Monitor class capacity and instructor availability</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Scheduling' }
  ];

  return (
    <PageContainer title="Scheduling" header={header} breadcrumbs={breadcrumbs}>
      <SchedulingClient initialEvents={events as any} />
    </PageContainer>
  );
}

export default SchedulingPage;
