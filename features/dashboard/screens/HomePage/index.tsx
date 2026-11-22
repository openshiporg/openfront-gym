/**
 * Dashboard home: the club's day. Today's classes with seats, the figures an owner checks first,
 * and the workspaces this person may open. Each block is shown only to roles the server allows.
 */

import React from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '../../components/PageContainer'
import { gymGraphql } from '@/features/platform/lib/gym-graphql'
import { requireDashboardUser } from '@/features/platform/lib/current-user'
import { getPlatformNavItemsWithBasePath } from '@/features/platform/lib/navigation'
import { formatMinorUnits } from '@/features/platform/lib/currency'
import {
  EmptyBlock,
  Notice,
  Panel,
  PanelHeader,
  PlatformBody,
  PlatformHeader,
  SeatCount,
  SplitLayout,
} from '@/features/platform/components/platform-ui'
import type { ReportsDashboardData } from '@/features/platform/reports/actions/reports'
import type { CalendarEvent } from '@/features/platform/scheduling/actions/scheduling'

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function safeZone(timeZone?: string | null) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC' })
    return timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function Stat({ label, value, detail, href }: { label: string; value: React.ReactNode; detail?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </>
  )
  const className = 'block min-w-0 rounded-lg border bg-background p-4'
  return href
    ? <Link href={href} className={`${className} transition-colors hover:bg-muted/50`}>{body}</Link>
    : <div className={className}>{body}</div>
}

export async function HomePage() {
  const user = await requireDashboardUser()
  const role = user.role
  const manager = Boolean(role?.canManageAllRecords)
  const canSeeReports = manager || Boolean(role?.canViewReports)
  const canSeeSchedule = manager || Boolean(role?.isInstructor)
  const canCheckIn = manager || Boolean(role?.canManageCheckIns || role?.canManageFacilities)
  const now = new Date()

  const [reportsResponse, scheduleResponse] = await Promise.all([
    canSeeReports
      ? gymGraphql<{ reportsDashboard: ReportsDashboardData }>(`query HomeReports { reportsDashboard }`)
      : null,
    canSeeSchedule
      ? gymGraphql<{ schedulingWorkspace: { events: CalendarEvent[]; timeZone: string } }>(
          `query HomeSchedule($start: DateTime!, $end: DateTime!, $userId: ID) { schedulingWorkspace(start: $start, end: $end, userId: $userId) }`,
          {
            start: new Date(now.getTime() - DAY_MS).toISOString(),
            end: new Date(now.getTime() + 2 * DAY_MS).toISOString(),
            userId: manager ? null : user.id,
          },
        )
      : null,
  ])

  const reports = reportsResponse?.success ? reportsResponse.data.reportsDashboard : null
  const schedule = scheduleResponse?.success ? scheduleResponse.data.schedulingWorkspace : null
  const timeZone = safeZone(schedule?.timeZone || reports?.timeZone)
  const today = dayKey(now, timeZone)
  const sessions = (schedule?.events ?? [])
    .filter((event) => dayKey(new Date(event.start), timeZone) === today)
    .sort((a, b) => a.start.localeCompare(b.start))
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(now)
  const workspaces = getPlatformNavItemsWithBasePath('/dashboard', user).filter((item) => item.title !== 'Your account')
  const pastDue = reports?.operator.pastDueMemberships ?? 0
  const firstName = user.name?.trim().split(/\s+/)[0]

  const header = (
    <PlatformHeader
      title={firstName ? `Today, ${firstName}` : 'Today'}
      description={dateLabel}
      actions={
        canCheckIn ? (
          <Button asChild>
            <Link href="/dashboard/platform/check-in"><UserCheck aria-hidden />Check in a member</Link>
          </Button>
        ) : undefined
      }
    />
  )

  const classesPanel = canSeeSchedule ? (
    <Panel>
      <PanelHeader
        icon={CalendarClock}
        title={manager ? "Today's classes" : 'Your classes today'}
        count={sessions.length}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/platform/scheduling">Calendar<ChevronRight aria-hidden /></Link>
          </Button>
        }
      />
      {!schedule ? (
        <EmptyBlock compact icon={CalendarClock} title="Today's classes could not be loaded" description="Open the calendar to see them." />
      ) : sessions.length === 0 ? (
        <EmptyBlock compact icon={CalendarClock} title="No classes today" description="Sessions you add in Scheduling show here on the day." />
      ) : (
        <ul className="divide-y">
          {sessions.map((session) => {
            const [booked, capacity] = String(session.capacity || '').split('/').map((part) => Number(part))
            const over = new Date(session.end).getTime() < now.getTime()
            const row = (
              <>
                <span className="w-[4.75rem] shrink-0 text-sm font-medium tabular-nums text-foreground">{time.format(new Date(session.start))}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${session.isCancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{session.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {session.instructor || 'No coach assigned'}{session.isCancelled ? ' · Cancelled' : over ? ' · Finished' : ''}
                  </span>
                </span>
                {Number.isFinite(booked) && Number.isFinite(capacity) ? <SeatCount booked={booked} capacity={capacity} /> : null}
              </>
            )
            return (
              <li key={session.id}>
                {session.rosterHref ? (
                  <Link href={session.rosterHref} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 sm:px-5">
                    {row}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ) : (
                  <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  ) : null

  const workspacePanel = (
    <Panel>
      <PanelHeader title="Go to" />
      {workspaces.length === 0 ? (
        <EmptyBlock compact title="Nothing to open yet" description="Ask the club owner to give your role access." />
      ) : (
        <ul className="divide-y">
          {workspaces.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link href={item.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 sm:px-5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )

  return (
    <PageContainer title="Today" header={header} breadcrumbs={[{ type: 'page' as const, label: 'Today' }]}>
      <PlatformBody>
        {pastDue > 0 ? (
          <Notice
            tone="danger"
            title={`${pastDue} membership${pastDue === 1 ? ' is' : 's are'} past due`}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/platform/billing#recovery">Open Billing</Link>
              </Button>
            }
          >
            A payment did not go through. Follow up before the member loses access.
          </Notice>
        ) : null}

        {reports ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Checked in today" value={reports.operator.checkInsToday} href={canCheckIn ? '/dashboard/platform/check-in' : undefined} />
            <Stat label="Classes today" value={reports.operator.upcomingSessionsToday} detail={reports.operator.liveOrStartingSoon ? `${reports.operator.liveOrStartingSoon} on now or soon` : undefined} href={canSeeSchedule ? '/dashboard/platform/scheduling' : undefined} />
            <Stat label="Active members" value={reports.operator.activeMembers} href={manager ? '/dashboard/platform/members' : undefined} />
            <Stat
              label="Paid this month"
              value={formatMinorUnits(reports.revenue.monthlyRevenue, reports.revenue.currencyCode)}
              detail={`${reports.revenue.monthlySettledPayments} payment${reports.revenue.monthlySettledPayments === 1 ? '' : 's'}`}
              href="/dashboard/platform/reports"
            />
          </div>
        ) : null}

        {classesPanel ? <SplitLayout asideWidth="narrow" main={classesPanel} aside={workspacePanel} /> : <div className="max-w-xl">{workspacePanel}</div>}
      </PlatformBody>
    </PageContainer>
  )
}

export default HomePage
