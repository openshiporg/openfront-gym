"use client"

import { useEffect, useState } from "react"
import { request, gql } from "graphql-request"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

const CREATE_SCHEDULE = gql`
  mutation CreateSchedule($data: ClassScheduleCreateInput!) {
    createClassSchedule(data: $data) { id }
  }
`

const UPDATE_SCHEDULE = gql`
  mutation UpdateSchedule($id: ID!, $data: ClassScheduleUpdateInput!) {
    updateClassSchedule(where: { id: $id }, data: $data) { id }
  }
`

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

type ScheduleTemplate = {
  id: string
  name: string
  description?: string | null
  dayOfWeek: string
  startTime: string
  endTime: string
  maxCapacity: number
  isActive: boolean
  instructor?: { id: string; user?: { name?: string | null } | null } | null
}

type InstructorOption = {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

function getInitialState(schedule?: ScheduleTemplate | null) {
  return {
    name: schedule?.name || "",
    description: schedule?.description || "",
    dayOfWeek: schedule?.dayOfWeek || "monday",
    startTime: schedule?.startTime || "07:00",
    endTime: schedule?.endTime || "08:00",
    maxCapacity: schedule?.maxCapacity ?? 12,
    instructorId: schedule?.instructor?.id || "unassigned",
    isActive: schedule?.isActive ?? true,
  }
}

export function ScheduleEditorDialog({
  open,
  onOpenChange,
  instructors,
  schedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  instructors: InstructorOption[]
  schedule?: ScheduleTemplate | null
}) {
  const router = useRouter()
  const [form, setForm] = useState(getInitialState(schedule))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(getInitialState(schedule))
      setError(null)
    }
  }, [open, schedule])

  const save = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const data: any = {
        name: form.name,
        description: form.description,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: Number(form.maxCapacity || 0),
        isActive: form.isActive,
        instructor: form.instructorId !== "unassigned" ? { connect: { id: form.instructorId } } : undefined,
      }

      if (schedule?.id) {
        if (form.instructorId === "unassigned") {
          data.instructor = { disconnect: true }
        }
        await request('/api/graphql', UPDATE_SCHEDULE, { id: schedule.id, data })
      } else {
        await request('/api/graphql', CREATE_SCHEDULE, { data })
      }

      onOpenChange(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Failed to save schedule')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Edit recurring schedule' : 'Create recurring schedule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Class name</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Instructor</label>
              <Select value={form.instructorId} onValueChange={(value) => setForm((f) => ({ ...f, instructorId: value }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.user?.name || inst.user?.email || inst.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-2 min-h-[100px]" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day</label>
              <Select value={form.dayOfWeek} onValueChange={(value) => setForm((f) => ({ ...f, dayOfWeek: value }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">End</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Capacity</label>
              <Input type="number" value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: Number(e.target.value) }))} className="mt-2" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Schedule active</p>
              <p className="text-xs text-muted-foreground">Inactive templates remain in records but stop representing active recurring classes.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
          </div>

          {error && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save schedule'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
