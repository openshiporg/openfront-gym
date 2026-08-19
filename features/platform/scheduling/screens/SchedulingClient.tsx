"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, GraduationCap, Plus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { ExperimentalCalendar } from "../components/experimental-calendar/ExperimentalCalendar"
import type { CalendarEvent as ExperimentalCalendarEvent } from "../components/experimental-calendar/types"
import { ScheduleEditorDialog } from "../components/ScheduleEditorDialog"
import { InstanceEditorDialog } from "../components/InstanceEditorDialog"
import { cancelClassInstanceAction, generateUpcomingInstances } from "../actions/scheduling"

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
  } | null
  instructor?: { id: string; user?: { name?: string | null } | null } | null
}

interface SchedulingClientProps {
  initialEvents: Event[]
  schedules: ScheduleTemplate[]
  instructors: InstructorOption[]
  upcomingInstances: UpcomingInstance[]
  timeZone: string
  isInstructor?: boolean
  canManageWorkspace?: boolean
}

export function SchedulingClient({
  initialEvents,
  schedules,
  instructors,
  upcomingInstances,
  timeZone,
  isInstructor = false,
  canManageWorkspace = false,
}: SchedulingClientProps) {
  const router = useRouter()
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

  const cancelInstance = async () => {
    if (!cancellingInstance || cancellationReason.trim().length < 3) return
    setIsCancelling(true)
    try {
      const outcome = await cancelClassInstanceAction(cancellingInstance.id, cancellationReason.trim())
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
      const result = await generateUpcomingInstances(weeks)
      if (!result.success) throw new Error('Instance generation failed')
      toast.success(`Created ${result.createdCount} upcoming class instance(s).`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Instance generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canManageWorkspace ? (
            <>
              <Button variant="outline" className="rounded-none" onClick={() => generateInstances(4)} disabled={isGenerating}>
                {isGenerating ? 'Generating…' : 'Generate 4 weeks'}
              </Button>
              <Button variant="outline" className="rounded-none" onClick={() => { setEditingSchedule(null); setIsCreateScheduleOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> New recurring schedule
              </Button>
              <Button className="rounded-none" onClick={() => { setEditingInstance(null); setDefaultScheduleForInstance(schedules[0] || null); setIsCreateInstanceOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Create one-off instance
              </Button>
            </>
          ) : (
            <p className="text-xs font-medium text-muted-foreground">
              {isInstructor ? 'Instructor view · roster-first access' : 'Read-only scheduling view'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 divide-x rounded-lg border bg-card md:grid-cols-4">
          {[['Templates', schedules.length], ['Active', activeScheduleCount], ['Instructors', instructors.length], ['Upcoming instances', upcomingInstances.length]].map(([label, value]) => (
            <div key={String(label)} className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <ExperimentalCalendar events={calendarEvents} timeZone={timeZone} />
      </div>

      <div className="min-w-0 space-y-6">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Scheduling inventory</p>
              <h3 className="mt-1 text-lg font-semibold">Recurring templates</h3>
            </div>
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-6 space-y-3 max-h-[720px] overflow-auto pr-1">
            {schedules.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-10 text-sm text-muted-foreground">
                No recurring schedules yet. Create a template to establish the weekly program.
              </div>
            ) : (
              schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md border px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{schedule.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {schedule.dayOfWeek} · {schedule.startTime}–{schedule.endTime}
                      </p>
                    </div>
                    <Badge variant="outline">{schedule.maxCapacity} cap</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" /> {schedule.instructor?.user?.name || 'Unassigned'}</span>
                    <span>{schedule.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  {canManageWorkspace ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingSchedule(schedule)}>Edit template</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setEditingInstance(null); setDefaultScheduleForInstance(schedule); setIsCreateInstanceOpen(true) }}>Create instance</Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Live queue</p>
              <h3 className="mt-1 text-lg font-semibold">Upcoming sessions</h3>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-6 space-y-3 max-h-[520px] overflow-auto pr-1">
            {upcomingInstances.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-10 text-sm text-muted-foreground">
                No upcoming class instances. Generate the rolling schedule or create a one-off session.
              </div>
            ) : (
              upcomingInstances.map((instance) => (
                <div key={instance.id} className="rounded-md border px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{instance.classSchedule?.name || 'Class instance'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(instance.date))}
                      </p>
                    </div>
                    <Link href={`/dashboard/platform/rosters/${instance.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                      Open roster
                    </Link>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                    <span>{instance.instructor?.user?.name || 'TBA'}</span>
                    <span>{instance.bookingsCount || 0}/{instance.maxCapacity || instance.classSchedule?.maxCapacity || 0}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/dashboard/platform/rosters/${instance.id}`} className="text-sm font-medium hover:underline">
                        View roster
                      </Link>
                      {canManageWorkspace ? (
                        <button type="button" onClick={() => { setEditingInstance(instance); setDefaultScheduleForInstance(null); setIsCreateInstanceOpen(true) }} className="text-sm font-medium hover:underline">
                          Edit instance
                        </button>
                      ) : null}
                    </div>
                    {canManageWorkspace ? (
                      !instance.isCancelled ? (
                        <button type="button" onClick={() => { setCancellingInstance(instance); setCancellationReason("") }} className="text-sm font-medium text-destructive hover:underline">
                          Cancel instance
                        </button>
                      ) : (
                        <Badge variant="destructive">Cancelled</Badge>
                      )
                    ) : instance.isCancelled ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(cancellingInstance)} onOpenChange={(open) => { if (!open && !isCancelling) { setCancellingInstance(null); setCancellationReason("") } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel this class instance?</DialogTitle><DialogDescription>Confirmed and waitlisted bookings will be closed. Finite credits are returned by the existing lifecycle action. Member notification remains an operator task.</DialogDescription></DialogHeader>
          <label className="space-y-2 text-sm font-medium">Cancellation reason<Textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} minLength={3} maxLength={500} placeholder="Describe the operational reason" /></label>
          <DialogFooter><Button variant="outline" onClick={() => setCancellingInstance(null)} disabled={isCancelling}>Keep session</Button><Button variant="destructive" onClick={cancelInstance} disabled={isCancelling || cancellationReason.trim().length < 3}>{isCancelling ? "Cancelling…" : "Cancel session"}</Button></DialogFooter>
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
        schedule={editingSchedule}
          />

          <InstanceEditorDialog
            open={isCreateInstanceOpen}
            onOpenChange={(open) => {
              setIsCreateInstanceOpen(open)
              if (!open) setEditingInstance(null)
            }}
            schedules={schedules}
            instructors={instructors}
            defaultSchedule={defaultScheduleForInstance}
            instance={editingInstance as any}
          />
        </>
      ) : null}
    </div>
  )
}
