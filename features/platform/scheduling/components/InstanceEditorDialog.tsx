"use client"

import { useEffect, useState } from "react"
import { request, gql } from "graphql-request"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CREATE_INSTANCE = gql`
  mutation CreateInstance($data: ClassInstanceCreateInput!) {
    createClassInstance(data: $data) { id }
  }
`

const UPDATE_INSTANCE = gql`
  mutation UpdateInstance($id: ID!, $data: ClassInstanceUpdateInput!) {
    updateClassInstance(where: { id: $id }, data: $data) { id }
  }
`

type ScheduleTemplate = {
  id: string
  name: string
  dayOfWeek?: string
  startTime: string
  endTime: string
  maxCapacity: number
}

type InstructorOption = {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

type InstanceRecord = {
  id: string
  date: string
  maxCapacity?: number | null
  classSchedule?: { id: string; startTime?: string | null; maxCapacity?: number | null } | null
  instructor?: { id: string } | null
}

function getInitial(schedule?: ScheduleTemplate | null, instance?: InstanceRecord | null) {
  const baseDate = instance ? new Date(instance.date) : new Date()
  const date = baseDate.toISOString().slice(0, 10)
  const time = instance
    ? `${String(baseDate.getHours()).padStart(2, "0")}:${String(baseDate.getMinutes()).padStart(2, "0")}`
    : schedule?.startTime || "07:00"

  return {
    scheduleId: instance?.classSchedule?.id || schedule?.id || "",
    date,
    time,
    instructorId: instance?.instructor?.id || "default",
    maxCapacity: instance?.maxCapacity ?? instance?.classSchedule?.maxCapacity ?? schedule?.maxCapacity ?? 12,
  }
}

export function InstanceEditorDialog({
  open,
  onOpenChange,
  schedules,
  instructors,
  defaultSchedule,
  instance,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedules: ScheduleTemplate[]
  instructors: InstructorOption[]
  defaultSchedule?: ScheduleTemplate | null
  instance?: InstanceRecord | null
}) {
  const router = useRouter()
  const [form, setForm] = useState(getInitial(defaultSchedule, instance))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(getInitial(defaultSchedule, instance))
      setError(null)
    }
  }, [open, defaultSchedule, instance])

  const save = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const dateTime = new Date(`${form.date}T${form.time}:00`)
      const data: any = {
        classSchedule: { connect: { id: form.scheduleId } },
        date: dateTime.toISOString(),
        maxCapacity: Number(form.maxCapacity || 0),
        isCancelled: false,
      }

      if (form.instructorId !== "default") {
        data.instructor = { connect: { id: form.instructorId } }
      } else if (instance?.id) {
        data.instructor = { disconnect: true }
      }

      if (instance?.id) {
        await request('/api/graphql', UPDATE_INSTANCE, { id: instance.id, data })
      } else {
        await request('/api/graphql', CREATE_INSTANCE, { data })
      }
      onOpenChange(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Failed to create class instance')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{instance ? 'Edit class instance' : 'Create one-off class instance'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Schedule template</label>
            <Select value={form.scheduleId} onValueChange={(value) => setForm((f) => ({ ...f, scheduleId: value }))}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {schedules.map((schedule) => (
                  <SelectItem key={schedule.id} value={schedule.id}>{schedule.name} · {schedule.dayOfWeek || ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start time</label>
              <Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="mt-2" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Instructor override</label>
              <Select value={form.instructorId} onValueChange={(value) => setForm((f) => ({ ...f, instructorId: value }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Use template instructor</SelectItem>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.user?.name || inst.user?.email || inst.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Capacity override</label>
              <Input type="number" value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: Number(e.target.value) }))} className="mt-2" />
            </div>
          </div>

          {error && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={isSaving || !form.scheduleId}>{isSaving ? 'Saving…' : instance ? 'Save instance' : 'Create instance'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
