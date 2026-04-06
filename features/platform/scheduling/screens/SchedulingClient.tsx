"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { request, gql } from "graphql-request"
import { useRouter } from "next/navigation"
import { CalendarDays, GraduationCap, Plus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExperimentalCalendar } from "../components/experimental-calendar/ExperimentalCalendar"
import type { CalendarEvent as ExperimentalCalendarEvent } from "../components/experimental-calendar/types"
import { ScheduleEditorDialog } from "../components/ScheduleEditorDialog"
import { InstanceEditorDialog } from "../components/InstanceEditorDialog"

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
  isInstructor?: boolean
  canManageWorkspace?: boolean
}

const CANCEL_INSTANCE = gql`
  mutation CancelInstance($id: ID!, $data: ClassInstanceUpdateInput!) {
    updateClassInstance(where: { id: $id }, data: $data) { id }
  }
`

export function SchedulingClient({
  initialEvents,
  schedules,
  instructors,
  upcomingInstances,
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

  const cancelInstance = async (instanceId: string) => {
    await request('/api/graphql', CANCEL_INSTANCE, {
      id: instanceId,
      data: { isCancelled: true, cancellationReason: 'Cancelled from scheduling workspace' },
    })
    router.refresh()
  }

  const generateInstances = async (weeks: number) => {
    setIsGenerating(true)
    try {
      await fetch('/api/scheduling/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks }),
      })
      router.refresh()
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-6">
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
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">
              {isInstructor ? 'Instructor view · roster-first access' : 'Read-only scheduling view'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-x border border-white/10 bg-[#111111] text-white">
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Templates</p>
            <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black">{schedules.length}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Active</p>
            <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black text-[#7df4ff]">{activeScheduleCount}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Instructors</p>
            <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black text-[#ffb59e]">{instructors.length}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Upcoming instances</p>
            <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black">{upcomingInstances.length}</p>
          </div>
        </div>

        <ExperimentalCalendar events={calendarEvents} />
      </div>

      <div className="space-y-6">
        <div className="border border-white/10 bg-[#111111] p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Scheduling inventory</p>
              <h3 className="mt-2 font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em]">Recurring templates</h3>
            </div>
            <CalendarDays className="h-5 w-5 text-[#ffb59e]" />
          </div>

          <div className="mt-6 space-y-3 max-h-[720px] overflow-auto pr-1">
            {schedules.length === 0 ? (
              <div className="border border-white/10 bg-black px-4 py-10 text-sm uppercase tracking-[0.16em] text-[#7c7f7f]">
                No recurring schedules yet.
              </div>
            ) : (
              schedules.map((schedule) => (
                <div key={schedule.id} className="border border-white/10 bg-black px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-white">{schedule.name}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">
                        {schedule.dayOfWeek} · {schedule.startTime}–{schedule.endTime}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-none border-white/10 text-[#8f9292]">{schedule.maxCapacity} cap</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">
                    <span className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" /> {schedule.instructor?.user?.name || 'Unassigned'}</span>
                    <span>{schedule.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  {canManageWorkspace ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => setEditingSchedule(schedule)} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb59e] hover:text-white">
                        Edit template
                      </button>
                      <button type="button" onClick={() => { setEditingInstance(null); setDefaultScheduleForInstance(schedule); setIsCreateInstanceOpen(true) }} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7df4ff] hover:text-white">
                        Create instance
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border border-white/10 bg-[#111111] p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Live queue</p>
              <h3 className="mt-2 font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em]">Upcoming sessions</h3>
            </div>
            <Users className="h-5 w-5 text-[#7df4ff]" />
          </div>

          <div className="mt-6 space-y-3 max-h-[520px] overflow-auto pr-1">
            {upcomingInstances.length === 0 ? (
              <div className="border border-white/10 bg-black px-4 py-10 text-sm uppercase tracking-[0.16em] text-[#7c7f7f]">
                No upcoming class instances.
              </div>
            ) : (
              upcomingInstances.map((instance) => (
                <div key={instance.id} className="border border-white/10 bg-black px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-white">{instance.classSchedule?.name || 'Class instance'}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">
                        {new Date(instance.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <Link href={`/dashboard/platform/rosters/${instance.id}`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb59e] hover:text-white">
                      Open roster
                    </Link>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">
                    <span>{instance.instructor?.user?.name || 'TBA'}</span>
                    <span>{instance.bookingsCount || 0}/{instance.maxCapacity || instance.classSchedule?.maxCapacity || 0}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/dashboard/platform/rosters/${instance.id}`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb59e] hover:text-white">
                        View roster
                      </Link>
                      {canManageWorkspace ? (
                        <button type="button" onClick={() => { setEditingInstance(instance); setDefaultScheduleForInstance(null); setIsCreateInstanceOpen(true) }} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7df4ff] hover:text-white">
                          Edit instance
                        </button>
                      ) : null}
                    </div>
                    {canManageWorkspace ? (
                      !instance.isCancelled ? (
                        <button type="button" onClick={() => cancelInstance(instance.id)} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb4ab] hover:text-white">
                          Cancel instance
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7c7f7f]">Cancelled</span>
                      )
                    ) : instance.isCancelled ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7c7f7f]">Cancelled</span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
