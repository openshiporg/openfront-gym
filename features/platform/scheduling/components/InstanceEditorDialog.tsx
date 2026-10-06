"use client"

import { useEffect, useState } from "react"
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
import { saveClassInstance } from "../actions/scheduling"
import { localDateParts, localTimeToUtc } from "@/lib/timezone"

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
  location?: { id: string } | null
  resource?: { id: string } | null
  id: string
  date: string
  maxCapacity?: number | null
  classSchedule?: { id: string; startTime?: string | null; maxCapacity?: number | null } | null
  instructor?: { id: string } | null
}

function getInitial(schedule: ScheduleTemplate | null | undefined, instance: InstanceRecord | null | undefined, timeZone: string) {
  const baseDate = instance ? new Date(instance.date) : new Date()
  const local = localDateParts(baseDate, timeZone)
  const date = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`
  const time = instance
    ? `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`
    : schedule?.startTime || "07:00"

  return {
    locationId: instance?.location?.id || "default",
    resourceId: instance?.resource?.id || "default",
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
  locations,
  resources,
  defaultSchedule,
  instance,
  timeZone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedules: ScheduleTemplate[]
  locations: any[]
  resources: any[]
  instructors: InstructorOption[]
  defaultSchedule?: ScheduleTemplate | null
  instance?: InstanceRecord | null
  timeZone: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(getInitial(defaultSchedule, instance, timeZone))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(getInitial(defaultSchedule, instance, timeZone))
      setError(null)
    }
  }, [open, defaultSchedule, instance, timeZone])

  const save = async () => {
    setError(null)
    const match = `${form.date}T${form.time}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (!match) {
      setError("Choose a valid class date and start time.")
      return
    }
    if (!Number.isInteger(form.maxCapacity) || form.maxCapacity < 1 || form.maxCapacity > 10000) {
      setError("Capacity must be a whole number from 1 to 10000.")
      return
    }
    setIsSaving(true)

    try {
      const [, year, month, day, hour, minute] = match
      const dateTime = localTimeToUtc({
        year: Number(year), month: Number(month), day: Number(day),
        hour: Number(hour), minute: Number(minute), second: 0,
      }, timeZone)
      const data: any = {
        ...(form.locationId === "none" ? { location: { disconnect: true } } : form.locationId !== "default" ? { location: { connect: { id: form.locationId } } } : {}),
        ...(form.resourceId === "none" ? { resource: { disconnect: true } } : form.resourceId !== "default" ? { resource: { connect: { id: form.resourceId } } } : {}),
        classSchedule: { connect: { id: form.scheduleId } },
        date: dateTime.toISOString(),
        maxCapacity: Number(form.maxCapacity || 0),
      }

      if (form.instructorId !== "default") {
        data.instructor = { connect: { id: form.instructorId } }
      } else if (instance?.id) {
        data.instructor = { disconnect: true }
      }

      if (instance?.id) {
        await saveClassInstance(data, instance.id)
      } else {
        await saveClassInstance(data)
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
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Location<Select value={form.locationId} onValueChange={(value) => setForm((f) => ({ ...f, locationId: value, resourceId: "default" }))}><SelectTrigger aria-label="Class location"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Keep current / schedule location</SelectItem><SelectItem value="none">No location</SelectItem>{locations.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm">Resource<Select value={form.resourceId} onValueChange={(value) => setForm((f) => ({ ...f, resourceId: value }))}><SelectTrigger aria-label="Class resource"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Keep current / schedule resource</SelectItem><SelectItem value="none">No resource</SelectItem>{resources.filter((row) => form.locationId === "default" || row.location?.id === form.locationId).map((row) => <SelectItem key={row.id} value={row.id}>{row.name} ({row.capacity})</SelectItem>)}</SelectContent></Select></label>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Schedule template</label>
            <Select value={form.scheduleId} onValueChange={(value) => setForm((f) => ({ ...f, scheduleId: value }))}>
              <SelectTrigger aria-label="Schedule template" className="mt-2"><SelectValue /></SelectTrigger>
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
              <Input aria-label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start time</label>
              <Input aria-label="Start time" type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="mt-2" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Instructor override</label>
              <Select value={form.instructorId} onValueChange={(value) => setForm((f) => ({ ...f, instructorId: value }))}>
                <SelectTrigger aria-label="Instructor override" className="mt-2"><SelectValue /></SelectTrigger>
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
              <Input aria-label="Capacity override" type="number" min={1} max={10000} required value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: Number(e.target.value) }))} className="mt-2" />
            </div>
          </div>

          {error && <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={isSaving || !form.scheduleId}>{isSaving ? 'Saving…' : instance ? 'Save instance' : 'Create instance'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
