import Link from 'next/link';
import { Activity, ArrowUpRight, CalendarClock, CreditCard, HeartPulse, Users } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireReportsViewer } from '@/features/platform/lib/current-user';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  EmptyBlock,
  KeyValueList,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  PersonCell,
  PlatformBody,
  PlatformHeader,
  SplitLayout,
  StatusPill,
  Td,
  Th,
  Tr,
  humanize,
  type Tone,
} from '@/features/platform/components/platform-ui';
import { getReportsDashboardData } from '../actions/reports';
import { formatMinorUnits } from '@/features/platform/lib/currency';
import { formatReportDate, formatReportDateTime } from '../timezone';

function creditsLabel(value?: number | null) {
  if (value === -1) return 'Unlimited';
  if (typeof value === 'number') return `${value} left`;
  return '—';
}

function attendanceTone(rate: number): Tone {
  if (rate < 40) return 'danger';
  if (rate < 70) return 'warning';
  return 'positive';
}

function membershipTone(status?: string | null): Tone {
  if (status === 'active') return 'positive';
  if (status === 'past_due' || status === 'past-due') return 'danger';
  if (status === 'frozen' || status === 'paused' || status === 'pending') return 'warning';
  return 'neutral';
}

export async function ReportsOverviewPage() {
  await requireReportsViewer();
  const data = await getReportsDashboardData();
  const money = (value: number) => formatMinorUnits(value, data.revenue.currencyCode);
  const pastDue = data.operator.pastDueMemberships;

  const header = (
    <PlatformHeader
      eyebrow="Insights"
      title="Reports"
      description="Morning operator summary across attendance, utilization, revenue, and membership health."
      meta={<span className="text-xs text-muted-foreground">All times in {data.timeZone}</span>}
    />
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Reports' },
  ];

  const attendanceRows: Array<{ label: string; value: number; tone: Tone; detail: string }> = [
    { label: 'Attendance rate', value: data.attendance.attendanceRate, tone: attendanceTone(data.attendance.attendanceRate), detail: `${data.attendance.attendedCount} marked attended` },
    { label: 'No-show rate', value: data.attendance.noShowRate, tone: data.attendance.noShowRate >= 20 ? 'danger' : data.attendance.noShowRate >= 10 ? 'warning' : 'neutral', detail: `${data.attendance.noShowCount} no-shows` },
  ];

  return (
    <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {pastDue > 0 ? (
          <Notice
            tone="danger"
            title={`${pastDue} membership${pastDue === 1 ? ' is' : 's are'} past due`}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/platform/billing#recovery">Open recovery queue <ArrowUpRight aria-hidden /></Link>
              </Button>
            }
          >
            Recurring billing needs follow-up. Contact these members from Billing before access issues escalate.
          </Notice>
        ) : null}


        <SplitLayout
          main={
            <>
              <Panel>
                <PanelHeader
                  icon={Activity}
                  title="Upcoming session utilization"
                  count={data.utilization.length}
                  description="Seat fill and waitlist pressure for the next classes on deck."
                  actions={
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/dashboard/platform/rosters">Rosters <ArrowUpRight aria-hidden /></Link>
                    </Button>
                  }
                />
                {data.utilization.length === 0 ? (
                  <EmptyBlock
                    icon={CalendarClock}
                    title="No upcoming sessions in the reporting window"
                    description="Create upcoming sessions in Scheduling to see utilization here."
                  />
                ) : (
                  <DataTable label="Upcoming session utilization" minWidth="42rem">
                    <thead>
                      <tr>
                        <Th>Class</Th>
                        <Th>Next session</Th>
                        <Th className="w-48">Fill</Th>
                        <Th align="right">Waitlist</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.utilization.map((row) => (
                        <Tr key={row.id}>
                          <Td>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.instructorName}</p>
                          </Td>
                          <Td className="whitespace-nowrap text-muted-foreground">{formatReportDateTime(row.nextSessionDate, data.timeZone)}</Td>
                          <Td>
                            <span className="text-xs tabular-nums">
                              {row.confirmedBookings}<span className="text-muted-foreground">/{row.maxCapacity}</span>
                              <span className="ml-2 text-muted-foreground">{row.utilizationPercent}%</span>
                            </span>
                          </Td>
                          <Td align="right">
                            {row.waitlistCount ? (
                              <span className="font-medium text-amber-700 dark:text-amber-400">{row.waitlistCount}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </Panel>

              <Panel>
                <PanelHeader
                  icon={HeartPulse}
                  title="Membership health"
                  count={data.membershipHealth.length}
                  description="Active members to watch for engagement or credit issues."
                />
                {data.membershipHealth.length === 0 ? (
                  <EmptyBlock
                    icon={Users}
                    title="No membership-health rows are available"
                    description="This report requires active member and membership records."
                  />
                ) : (
                  <DataTable label="Membership health" minWidth="44rem">
                    <thead>
                      <tr>
                        <Th>Member</Th>
                        <Th>Plan</Th>
                        <Th>Credits</Th>
                        <Th>Last check-in</Th>
                        <Th align="right">Attendance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.membershipHealth.map((member) => (
                        <Tr key={member.id}>
                          <Td><PersonCell name={member.name} detail={member.email} /></Td>
                          <Td>
                            <p className="text-sm">{member.planName}</p>
                            <StatusPill tone={membershipTone(member.membershipStatus)} className="mt-1">{humanize(member.membershipStatus)}</StatusPill>
                          </Td>
                          <Td className="tabular-nums text-muted-foreground">{creditsLabel(member.creditsRemaining)}</Td>
                          <Td className="whitespace-nowrap text-muted-foreground">{formatReportDate(member.lastCheckIn, data.timeZone)}</Td>
                          <Td align="right">
                            <StatusPill tone={attendanceTone(member.attendanceRate)}>{member.attendanceRate}%</StatusPill>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </Panel>
            </>
          }
          aside={
            <>
              <Panel>
                <PanelHeader icon={Users} title="Today at the gym" description="What matters most when opening the dashboard." />
                <PanelBody>
                  <KeyValueList
                    items={[
                      { label: 'Check-ins today', value: <span className="tabular-nums">{data.operator.checkInsToday}</span> },
                      { label: 'Live or starting in 90 minutes', value: <span className="tabular-nums">{data.operator.liveOrStartingSoon}</span> },
                      { label: 'Members with paid-through access', value: <span className="tabular-nums">{data.operator.activeMembers}</span> },
                      { label: 'Sessions today', value: <span className="tabular-nums">{data.operator.upcomingSessionsToday}</span> },
                      { label: 'Waitlist pressure', value: <span className="tabular-nums">{data.operator.waitlistPressure}</span> },
                    ]}
                  />
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader icon={Activity} title="Attendance" description="How reliably booked members show up." />
                <PanelBody>
                  <KeyValueList
                    items={[
                      ...attendanceRows.map((row) => ({
                        label: row.label,
                        value: <span className="tabular-nums"><StatusPill tone={row.tone}>{row.value}%</StatusPill> <span className="ml-1 text-xs text-muted-foreground">{row.detail}</span></span>,
                      })),
                      { label: 'Late arrivals', value: <span className="tabular-nums">{data.attendance.lateCount}</span> },
                    ]}
                  />
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader
                  icon={CreditCard}
                  title="Revenue context"
                  description="Operator-facing financial pulse; reconcile with provider statements."
                  actions={
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/dashboard/platform/billing">Billing <ArrowUpRight aria-hidden /></Link>
                    </Button>
                  }
                />
                <PanelBody>
                  <KeyValueList
                    items={[
                      { label: 'Net payments this month', value: <span className="tabular-nums">{money(data.revenue.monthlyRevenue)} · {data.revenue.monthlySettledPayments} payments</span> },
                      { label: 'Past-due memberships', value: <span className="tabular-nums">{pastDue}</span> },
                      { label: 'Lifetime net payments', value: <span className="tabular-nums">{money(data.revenue.totalRevenue)}</span> },
                      { label: 'Settled payments', value: <span className="tabular-nums">{data.revenue.settledPayments}</span> },
                      { label: 'Average payment', value: <span className="tabular-nums">{money(data.revenue.averagePayment)}</span> },
                    ]}
                  />
                </PanelBody>
              </Panel>
            </>
          }
        />
      </PlatformBody>
    </PageContainer>
  );
}

export default ReportsOverviewPage;
