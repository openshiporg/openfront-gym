import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarClock, CreditCard, TrendingUp, Users } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { requireReportsViewer } from '@/features/dashboard/lib/current-user';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getReportsDashboardData } from '../actions/reports';
import { formatMinorUnits } from '@/features/platform/lib/currency';
import { formatReportDate, formatReportDateTime } from '../timezone';

function creditsLabel(value?: number | null) {
  if (value === -1) return 'Unlimited';
  if (typeof value === 'number') return `${value} left`;
  return '—';
}

export async function ReportsOverviewPage() {
  await requireReportsViewer();
  const data = await getReportsDashboardData();

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Operations reports</h1>
      <p className="text-muted-foreground">
        Morning operator summary across revenue, attendance, utilization, and membership health.
      </p>
    </div>
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Reports' },
  ];

  return (
    <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-clip p-4 md:p-6">
        <div className="grid min-w-0 max-w-full gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Today</CardDescription>
              <CardTitle className="text-sm font-medium">Check-ins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data.operator.checkInsToday}</div>
              <p className="mt-1 text-xs text-muted-foreground">Live front-desk volume captured today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Next 90 minutes</CardDescription>
              <CardTitle className="text-sm font-medium">Live / starting soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data.operator.liveOrStartingSoon}</div>
              <p className="mt-1 text-xs text-muted-foreground">Sessions needing roster attention now</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current month</CardDescription>
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatMinorUnits(data.revenue.monthlyRevenue, data.revenue.currencyCode)}</div>
              <p className="mt-1 text-xs text-muted-foreground">Across {data.revenue.monthlySettledPayments} payments dated this month, net of their refunds</p>
            </CardContent>
          </Card>

          <Card className={data.operator.pastDueMemberships > 0 ? 'border-destructive' : ''}>
            <CardHeader className="pb-2">
              <CardDescription>Requires follow-up</CardDescription>
              <CardTitle className="text-sm font-medium">Past-due memberships</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${data.operator.pastDueMemberships > 0 ? 'text-destructive' : ''}`}>
                {data.operator.pastDueMemberships}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Billing recovery queue for staff</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="min-w-0 max-w-full space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Operator snapshot</CardTitle>
                </div>
                <CardDescription>What matters most when opening the dashboard in the morning.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Active members</div>
                  <div className="mt-2 text-2xl font-bold">{data.operator.activeMembers}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Sessions today</div>
                  <div className="mt-2 text-2xl font-bold">{data.operator.upcomingSessionsToday}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Waitlist pressure</div>
                  <div className="mt-2 text-2xl font-bold">{data.operator.waitlistPressure}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Average payment</div>
                  <div className="mt-2 text-2xl font-bold">{formatMinorUnits(data.revenue.averagePayment, data.revenue.currencyCode)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Attendance health</CardTitle>
                </div>
                <CardDescription>How reliably booked members are showing up.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Attendance rate</div>
                  <div className="mt-2 text-2xl font-bold">{data.attendance.attendanceRate}%</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">No-show rate</div>
                  <div className="mt-2 text-2xl font-bold">{data.attendance.noShowRate}%</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Marked attended</div>
                  <div className="mt-2 text-2xl font-bold">{data.attendance.attendedCount}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Late arrivals</div>
                  <div className="mt-2 text-2xl font-bold">{data.attendance.lateCount}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Upcoming session utilization</CardTitle>
                  <CardDescription>Spot occupancy and waitlist pressure for the next classes on deck.</CardDescription>
                </div>
                <Link href="/dashboard/platform/rosters" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  Open rosters
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent className="min-w-0 max-w-full">
                <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border">
                  <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Next session</TableHead>
                      <TableHead>Fill</TableHead>
                      <TableHead>Waitlist</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.utilization.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center"><p className="font-medium">No upcoming sessions in the reporting window.</p><p className="mt-1 text-xs text-muted-foreground">Create or generate class instances to populate utilization.</p></TableCell></TableRow> : data.utilization.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.instructorName}</TableCell>
                        <TableCell className="text-muted-foreground">{formatReportDateTime(row.nextSessionDate, data.timeZone)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{row.confirmedBookings}/{row.maxCapacity}</span>
                            <Badge variant={row.utilizationPercent >= 90 ? 'destructive' : row.utilizationPercent >= 70 ? 'default' : 'outline'}>
                              {row.utilizationPercent}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{row.waitlistCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>

          <aside className="min-w-0 max-w-full space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Revenue context</CardTitle>
                </div>
                <CardDescription>Simple operator-facing financial pulse without leaving the platform dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Total revenue</div>
                  <div className="mt-2 text-2xl font-bold">{formatMinorUnits(data.revenue.totalRevenue, data.revenue.currencyCode)}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Settled payments</div>
                  <div className="mt-2 text-2xl font-bold">{data.revenue.settledPayments}</div>
                </div>
                <Link href="/dashboard/platform/billing" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  Open billing dashboard
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Membership health</CardTitle>
                </div>
                <CardDescription>Quick list of active members to watch for engagement or credit issues.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.membershipHealth.length === 0 ? <div className="rounded-lg border border-dashed p-6"><p className="text-sm font-medium">No membership-health rows are available.</p><p className="mt-1 text-xs text-muted-foreground">This report requires active member and membership records.</p></div> : data.membershipHealth.map((member) => (
                  <div key={member.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant={member.attendanceRate < 40 ? 'destructive' : member.attendanceRate < 70 ? 'outline' : 'default'}>
                        {member.attendanceRate}% attend
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{member.planName}</span>
                      <span>•</span>
                      <span>Status {member.membershipStatus}</span>
                      <span>•</span>
                      <span>{creditsLabel(member.creditsRemaining)}</span>
                      <span>•</span>
                      <span>Last check-in {formatReportDate(member.lastCheckIn, data.timeZone)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {data.operator.pastDueMemberships > 0 && (
              <Card className="border-destructive">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <CardTitle className="text-base">Billing recovery queue</CardTitle>
                  </div>
                  <CardDescription>Members at risk of churn because recurring billing needs follow-up.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {data.operator.pastDueMemberships} membership{data.operator.pastDueMemberships === 1 ? '' : 's'} are currently past due. Review these accounts from billing and contact members before access issues escalate.
                  </p>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}

export default ReportsOverviewPage;
