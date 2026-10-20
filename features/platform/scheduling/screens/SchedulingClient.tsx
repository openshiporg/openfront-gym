"use client"

import React, { useCallback, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, CalendarPlus, Clock3, GraduationCap, Plus, Repeat, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  SeatCount,
  EmptyBlock,
  FieldTextarea,
  FormField,
  KeyValueList,
  Notice,
  Panel,
  PanelHeader,
  PlatformBody,
  SplitLayout,
  StatusPill,
} from "@/features/platform/components/platform-ui"
import { ExperimentalCalendar } from "../components/experimental-calendar/ExperimentalCalendar"
import type { CalendarEvent as ExperimentalCalendarEvent } from "../components/experimental-calendar/types"
import { ScheduleEditorDialog } from "../components/ScheduleEditorDialog"
import { InstanceEditorDialog } from "../components/InstanceEditorDialog"
import { cancelClassInstanceAction, generateUpcomingInstances } from "../actions/scheduling"
import { formatRosterDayHeading, rosterDayKey } from "../../rosters/timezone"

type Event = {
  id: string
  title: string
  start: string
  end: string
  instructor: string
  capacity: string
  type: string
  color: string
  isCancelled?: boolean
  rosterHref?: string
  scheduleId?: string
}

type ScheduleTemplate = {
  id: string
  name: string
  description?: string | null
  dayOfWeek: string
  startTime: string
  endTime: string
  maxCapacity: number
  isActive: boolean
  instructor?: { id: string; user?: { id: string; name?: string | null; email?: string | null } | null } | null
  classType?: { id: string; name?: string | null } | null
}

type InstructorOption = {
  id: string
  user?: { id: string; name?: string | null; email?: string | null } | null
}

type UpcomingInstance = {
  id: string
  date: string
  isCancelled?: boolean
  cancellationReason?: string | null
  bookingsCount?: number | null
  maxCapacity?: number | null
  classSchedule?: {
    id: string
    name: string
    dayOfWeek: string
    startTime: string
    endTime: string
    maxCapacity: number
    instructor?: { id: string; user?: { name?: string | null } | null } | null
  } | null
  instructor?: { id: string; user?: { name?: string | null } | null } | null
}

interface SchedulingClientProps {
  initialEvents: Event[]
  schedules: ScheduleTemplate[]
  instructors: InstructorOption[]
  locations: any[]
  resources: any[]
  classTypes: Array<{ id: string; name?: string | null }>
  upcomingInstances: UpcomingInstance[]
  timeZone: string
  isInstructor?: boolean
  canManageWorkspace?: boolean
  loadedWindow?: { from: string; to: string }
  windowComplete?: boolean
  truncatedOptions?: Partial<Record<"schedules" | "instructors" | "classTypes" | "locations" | "resources", boolean>>
  initialDate?: string
}

export function SchedulingClient({
  initialEvents,
  schedules,
  instructors,
  classTypes,
  locations,
  resources,
  upcomingInstances,
  timeZone,
  isInstructor = false,
  canManageWorkspace = false,
  loadedWindow,
  windowComplete = true,
  truncatedOptions = {},
  initialDate,
}: SchedulingClientProps) {
  const router = useRouter()
  const [isLoadingWindow, startWindowTransition] = useTransition()
  const [now] = useState(() => Date.now())
  const requestWindow = useCallback(
    (from: string) => {
      startWindowTransition(() => {
        router.replace(`/dashboard/platform/scheduling?from=${from}`, { scroll: false })
      })
    },
    [router],
  )
  const [editingSchedule, setEditingSchedule] = useState<ScheduleTemplate | null>(null)
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false)
  const [defaultScheduleForInstance, setDefaultScheduleForInstance] = useState<ScheduleTemplate | null>(null)
  const [editingInstance, setEditingInstance] = useState<UpcomingInstance | null>(null)
  const [isCreateInstanceOpen, setIsCreateInstanceOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [cancellingInstance, setCancellingInstance] = useState<UpcomingInstance | null>(null)
  const [cancellationReason, setCancellationReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)

  const calendarEvents = useMemo<ExperimentalCalendarEvent[]>(
    () =>
      initialEvents.map((event) => ({
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        color: event.color as any,
        instructor: event.instructor,
        capacity: event.capacity,
        rosterHref: event.rosterHref,
        isCancelled: event.isCancelled,
      })),
    [initialEvents]
  )

  const activeScheduleCount = schedules.filter((schedule) => schedule.isActive).length
  const unassignedUpcoming = upcomingInstances.filter(
    (instance) => !instance.isCancelled && !instance.instructor?.user?.name && !instance.classSchedule?.instructor?.user?.name,
  ).length
  const upcomingGroups = useMemo(() => {
    const groups: Array<{ key: string; heading: string; items: UpcomingInstance[] }> = []
    for (const instance of upcomingInstances) {
      const key = rosterDayKey(instance.date, timeZone)
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.items.push(instance)
      else groups.push({ key, heading: formatRosterDayHeading(instance.date, timeZone, now), items: [instance] })
    }
    return groups
  }, [upcomingInstances, timeZone, now])

  const cancelInstance = async () => {
    if (!cancellingInstance || cancellationReason.trim().length < 3) return
    setIsCancelling(true)
    try {
      const result = await cancelClassInstanceAction(cancellingInstance.id, cancellationReason.trim())
      if (!result.ok) throw new Error(result.error)
      const outcome = result.data
      toast.success(`Class cancelled. ${outcome.cancelledBookings} booking(s) closed and ${outcome.refundedCredits} credit(s) returned. Notify affected members outside Gym.`)
      setCancellingInstance(null)
      setCancellationReason("")
      router.refresh()
    } catch (error: any) {
      toast.error(error?.response?.errors?.[0]?.message || error?.message || 'Class cancellation failed')
    } finally {
      setIsCancelling(false)
    }
  }

  const generateInstances = async (weeks: number) => {
    setIsGenerating(true)
    try {
      const generated = await generateUpcomingInstances(weeks)
      if (!generated.ok) throw new Error(generated.error)
      const result = generated.data
      if (!result.success) throw new Error('Could not create sessions')
      toast.success(`Created ${result.createdCount} upcoming class session${result.createdCount === 1 ? "" : "s"}.${result.skippedNonexistent ? ` ${result.skippedNonexistent} skipped: their start time does not exist on a daylight-saving change day.` : ""}`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create sessions')
    } finally {
      setIsGenerating(false)
    }
  }

  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  const sortedSchedules = [...schedules].sort((a, b) => {
    const day = dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek)
    return day !== 0 ? day : a.startTime.localeCompare(b.startTime)
  })
  const formatInstanceTime = (value: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  const formatInstanceDate = (value: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  const firstActiveSchedule = sortedSchedules.find((schedule) => schedule.isActive) || null
  const cancellingBooked = cancellingInstance?.bookingsCount ?? 0
  const closeCancelDialog = () => {
    if (isCancelling) return
    setCancellingInstance(null)
    setCancellationReason("")
  }

  return (
    <PlatformBody>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" aria-hidden />
          Times shown in <span className="font-medium text-foreground">{timeZone}</span>
          {!canManageWorkspace ? (
            <StatusPill tone="info" className="ml-1">{isInstructor ? 'Instructor view · roster-first access' : 'Read-only scheduling view'}</StatusPill>
          ) : null}
        </p>
        {canManageWorkspace ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateInstances(4)}
              disabled={isGenerating || activeScheduleCount === 0}
              title={activeScheduleCount === 0 ? 'Activate a recurring template first' : 'Create dated sessions for the next four weeks from active templates'}
            >
              <CalendarPlus aria-hidden /> {isGenerating ? 'Generating…' : 'Generate 4 weeks'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditingSchedule(null); setIsCreateScheduleOpen(true) }}>
              <Repeat aria-hidden /> New template
            </Button>
            <Button
              size="sm"
              className="col-span-2 sm:col-span-1"
              disabled={!firstActiveSchedule}
              onClick={() => { setEditingInstance(null); setDefaultScheduleForInstance(firstActiveSchedule); setIsCreateInstanceOpen(true) }}
            >
              <Plus aria-hidden /> One-off session
            </Button>
          </div>
        ) : null}
      </div>

      {canManageWorkspace && schedules.length === 0 ? (
        <Notice
          tone="info"
          title="Set up the weekly program"
          action={
            <Button size="sm" onClick={() => { setEditingSchedule(null); setIsCreateScheduleOpen(true) }}>
              <Repeat aria-hidden /> New template
            </Button>
          }
        >
          Create a recurring template for each weekly class slot, then generate four weeks of sessions. Members can book
          once sessions are on the calendar.
        </Notice>
      ) : canManageWorkspace && activeScheduleCount > 0 && upcomingInstances.length === 0 ? (
        <Notice
          tone="warning"
          title="No upcoming sessions are bookable"
          action={
            <Button size="sm" variant="outline" onClick={() => generateInstances(4)} disabled={isGenerating}>
              <CalendarPlus aria-hidden /> {isGenerating ? 'Generating…' : 'Generate 4 weeks'}
            </Button>
          }
        >
          {activeScheduleCount} active template{activeScheduleCount === 1 ? '' : 's'} but nothing dated ahead. Generate
          sessions so members can book.
        </Notice>
      ) : null}

      {unassignedUpcoming ? (
        <Notice tone="warning">
          {unassignedUpcoming} upcoming session{unassignedUpcoming === 1 ? ' has' : 's have'} no coach. Assign one from Upcoming sessions.
        </Notice>
      ) : null}

      {Object.values(truncatedOptions).some(Boolean) ? (
        <Notice tone="info">
          Editor choices show the first 500 {[truncatedOptions.schedules && "templates", truncatedOptions.instructors && "coaches", truncatedOptions.classTypes && "class types", truncatedOptions.locations && "locations", truncatedOptions.resources && "rooms"].filter(Boolean).join(", ")} by name.
        </Notice>
      ) : null}

      <SplitLayout
        asideWidth="narrow"
        main={
          <ExperimentalCalendar
            events={calendarEvents}
            timeZone={timeZone}
            loadedWindow={loadedWindow}
            initialDate={initialDate}
            onWindowRequest={requestWindow}
            loading={isLoadingWindow}
            complete={windowComplete}
          />
        }
        aside={
          <>
            <Panel>
              <PanelHeader
                icon={Users}
                title="Upcoming sessions"
                count={upcomingInstances.length}
                description="The next dated sessions from now, with fill and coach at a glance."
              />
              {upcomingInstances.length === 0 ? (
                <EmptyBlock
                  compact
                  icon={CalendarDays}
                  title="No upcoming sessions"
                  description={canManageWorkspace ? 'Generate the rolling schedule or add a one-off session.' : 'Sessions assigned to you appear here once they are scheduled.'}
                />
              ) : (
                <div className="max-h-[36rem] overflow-y-auto">
                  {upcomingGroups.map((group) => (
                    <section key={group.key} aria-label={group.heading}>
                      <h3 className="sticky top-0 z-10 flex items-center justify-between border-b bg-muted/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur sm:px-5">
                        <span>{group.heading}</span>
                        <span className="font-medium normal-case tracking-normal tabular-nums">{group.items.length}</span>
                      </h3>
                      <ul className="divide-y">
                        {group.items.map((instance) => {
                          const booked = instance.bookingsCount || 0
                          const cap = instance.maxCapacity || instance.classSchedule?.maxCapacity || 0
                          const coach = instance.instructor?.user?.name || instance.classSchedule?.instructor?.user?.name
                          const full = !instance.isCancelled && cap > 0 && booked >= cap
                          return (
                            <li key={instance.id} className="space-y-2 px-4 py-3 sm:px-5">
                              <div className="flex items-start gap-3">
                                <p className={instance.isCancelled ? 'w-16 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground line-through' : 'w-16 shrink-0 text-sm font-semibold tabular-nums'}>
                                  {formatInstanceTime(instance.date)}
                                </p>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/dashboard/platform/rosters/${instance.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                                    {instance.classSchedule?.name || 'Class session'}
                                  </Link>
                                  <p className={coach ? 'truncate text-xs text-muted-foreground' : 'truncate text-xs font-medium text-amber-700 dark:text-amber-400'}>
                                    {coach || 'No coach assigned'}
                                  </p>
                                </div>
                                {instance.isCancelled ? <StatusPill tone="danger">Cancelled</StatusPill> : full ? <StatusPill tone="warning">Full</StatusPill> : null}
                              </div>
                              {!instance.isCancelled ? (
                                <div className="pl-[4.75rem]">
                                  <SeatCount booked={booked} capacity={cap} />
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[4.75rem] text-xs font-medium">
                                <Link href={`/dashboard/platform/rosters/${instance.id}`} className="text-foreground underline-offset-4 hover:underline">
                                  Roster
                                </Link>
                                {canManageWorkspace && !instance.isCancelled ? (
                                  <>
                                    <button type="button" onClick={() => { setEditingInstance(instance); setDefaultScheduleForInstance(null); setIsCreateInstanceOpen(true) }} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => { setCancellingInstance(instance); setCancellationReason("") }} className="text-rose-600 underline-offset-4 hover:underline dark:text-rose-400">
                                      Cancel session
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader
                icon={Repeat}
                title="Recurring templates"
                count={schedules.length}
                description="The weekly program that generates dated sessions."
              />
              {schedules.length === 0 ? (
                <EmptyBlock
                  compact
                  icon={Repeat}
                  title="No recurring templates yet"
                  description="Each template is one weekly class slot: day, time, coach, room, and capacity."
                  action={canManageWorkspace ? (
                    <Button size="sm" variant="outline" onClick={() => { setEditingSchedule(null); setIsCreateScheduleOpen(true) }}>
                      <Plus aria-hidden /> New template
                    </Button>
                  ) : null}
                />
              ) : (
                <ul className="max-h-[34rem] divide-y overflow-y-auto">
                  {sortedSchedules.map((schedule) => (
                    <li key={schedule.id} className={schedule.isActive ? 'px-4 py-3 sm:px-5' : 'bg-muted/20 px-4 py-3 sm:px-5'}>
                      <div className="flex items-start gap-3">
                        <span className={schedule.isActive ? 'grid h-9 w-11 shrink-0 place-items-center rounded-md border bg-background text-[11px] font-semibold uppercase tracking-wider' : 'grid h-9 w-11 shrink-0 place-items-center rounded-md border border-dashed text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'}>
                          {schedule.dayOfWeek.slice(0, 3)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{schedule.name}</p>
                            {!schedule.isActive ? <StatusPill>Paused</StatusPill> : null}
                          </div>
                          <p className="truncate text-xs tabular-nums text-muted-foreground">
                            {schedule.startTime}–{schedule.endTime} · {schedule.classType?.name || 'No class type'} · {schedule.maxCapacity} spots
                          </p>
                          <p className={schedule.instructor?.user?.name ? 'mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground' : 'mt-0.5 flex items-center gap-1.5 truncate text-xs text-amber-700 dark:text-amber-400'}>
                            <GraduationCap className="size-3.5 shrink-0" aria-hidden /> {schedule.instructor?.user?.name || 'No coach assigned'}
                          </p>
                        </div>
                      </div>
                      {canManageWorkspace ? (
                        <div className="mt-2 flex gap-3 pl-14 text-xs font-medium">
                          <button type="button" onClick={() => setEditingSchedule(schedule)} className="text-foreground underline-offset-4 hover:underline">Edit template</button>
                          {schedule.isActive ? (
                            <button type="button" onClick={() => { setEditingInstance(null); setDefaultScheduleForInstance(schedule); setIsCreateInstanceOpen(true) }} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Add one-off session</button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        }
      />

      <Dialog open={Boolean(cancellingInstance)} onOpenChange={(open) => { if (!open) closeCancelDialog() }}>
        <DialogContent className="w-[calc(100vw-2rem)] rounded-xl sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Cancel {cancellingInstance?.classSchedule?.name || 'this session'}?</DialogTitle>
            <DialogDescription className="text-pretty">
              This cannot be undone from Gym. The session stays on the calendar marked cancelled.
            </DialogDescription>
          </DialogHeader>
          {cancellingInstance ? (
            <KeyValueList
              className="rounded-lg border px-3.5 py-3"
              items={[
                { label: 'Starts', value: formatInstanceDate(cancellingInstance.date) },
                { label: 'Coach', value: cancellingInstance.instructor?.user?.name || cancellingInstance.classSchedule?.instructor?.user?.name || 'No coach assigned' },
                { label: 'Booked', value: `${cancellingBooked} member${cancellingBooked === 1 ? '' : 's'}` },
              ]}
            />
          ) : null}
          <Notice tone={cancellingBooked ? 'warning' : 'neutral'}>
            Confirmed and waitlisted bookings are closed and finite class credits are returned.
            {cancellingBooked ? ' Members are not messaged automatically. Contact them yourself.' : ''}
          </Notice>
          <FormField label="Cancellation reason" hint="Kept on the session record. At least 3 characters.">
            <FieldTextarea
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              minLength={3}
              maxLength={500}
              rows={3}
              placeholder="Coach illness, facility closure, low enrolment…"
            />
          </FormField>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeCancelDialog} disabled={isCancelling}>Keep session</Button>
            <Button variant="destructive" onClick={cancelInstance} disabled={isCancelling || cancellationReason.trim().length < 3}>
              {isCancelling ? 'Cancelling…' : 'Cancel session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageWorkspace ? (
        <>
          <ScheduleEditorDialog
            open={isCreateScheduleOpen || Boolean(editingSchedule)}
            onOpenChange={(open) => {
              if (!open) setEditingSchedule(null)
              setIsCreateScheduleOpen(open)
            }}
            instructors={instructors}
            classTypes={classTypes}
            locations={locations}
            resources={resources}
            schedule={editingSchedule}
          />

          <InstanceEditorDialog
            locations={locations}
            resources={resources}
            open={isCreateInstanceOpen}
            onOpenChange={(open) => {
              setIsCreateInstanceOpen(open)
              if (!open) setEditingInstance(null)
            }}
            schedules={schedules}
            instructors={instructors}
            defaultSchedule={defaultScheduleForInstance}
            instance={editingInstance as any}
            timeZone={timeZone}
          />
        </>
      ) : null}
    </PlatformBody>
  )
}
