"use client"

import { useEffect, useState } from "react"
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
import { saveClassSchedule } from "../actions/scheduling"

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
  location?: { id: string } | null
  resource?: { id: string } | null
  isActive: boolean
  instructor?: { id: string; user?: { name?: string | null } | null } | null
  classType?: { id: string; name?: string | null } | null
}

type InstructorOption = {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

function getInitialState(schedule?: ScheduleTemplate | null) {
  return {
    locationId: schedule?.location?.id || "none",
    resourceId: schedule?.resource?.id || "none",
    name: schedule?.name || "",
    description: schedule?.description || "",
    dayOfWeek: schedule?.dayOfWeek || "monday",
    startTime: schedule?.startTime || "07:00",
    endTime: schedule?.endTime || "08:00",
    maxCapacity: schedule?.maxCapacity ?? 12,
    instructorId: schedule?.instructor?.id || "unassigned",
    classTypeId: schedule?.classType?.id || "unassigned",
    isActive: schedule?.isActive ?? true,
  }
}

export function ScheduleEditorDialog({
  open,
  onOpenChange,
  instructors,
  locations,
  resources,
  classTypes,
  schedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: any[]
  resources: any[]
  instructors: InstructorOption[]
  classTypes: Array<{ id: string; name?: string | null }>
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
    setError(null)
    if (!form.name.trim()) {
      setError("Enter a class name.")
      return
    }
    if (form.classTypeId === "unassigned") {
      setError("Select a class type.")
      return
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.endTime) || form.endTime <= form.startTime) {
      setError("End time must be later than start time.")
      return
    }
    if (!Number.isInteger(form.maxCapacity) || form.maxCapacity < 1 || form.maxCapacity > 10000) {
      setError("Capacity must be a whole number from 1 to 10000.")
      return
    }
    setIsSaving(true)

    try {
      const data: any = {
        location: form.locationId === "none" ? { disconnect: true } : { connect: { id: form.locationId } },
        resource: form.resourceId === "none" ? { disconnect: true } : { connect: { id: form.resourceId } },
        name: form.name.trim(),
        description: form.description,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: Number(form.maxCapacity || 0),
        isActive: form.isActive,
        instructor: form.instructorId !== "unassigned" ? { connect: { id: form.instructorId } } : undefined,
        classType: { connect: { id: form.classTypeId } },
      }

      if (schedule?.id) {
        if (form.instructorId === "unassigned") {
          data.instructor = { disconnect: true }
        }
        await saveClassSchedule(data, schedule.id)
      } else {
        await saveClassSchedule(data)
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
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Location<Select value={form.locationId} onValueChange={(value) => setForm((f) => ({ ...f, locationId: value, resourceId: "none" }))}><SelectTrigger aria-label="Class location"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{locations.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm">Resource<Select value={form.resourceId} onValueChange={(value) => setForm((f) => ({ ...f, resourceId: value }))}><SelectTrigger aria-label="Class resource"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{resources.filter((row) => form.locationId === "none" || row.location?.id === form.locationId).map((row) => <SelectItem key={row.id} value={row.id}>{row.name} ({row.capacity})</SelectItem>)}</SelectContent></Select></label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="schedule-name" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Class name</label>
              <Input id="schedule-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Class type</label>
              <Select value={form.classTypeId} onValueChange={(value) => setForm((f) => ({ ...f, classTypeId: value }))}>
                <SelectTrigger aria-label="Class type" className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Select class type</SelectItem>
                  {classTypes.map((classType) => (
                    <SelectItem key={classType.id} value={classType.id}>{classType.name || classType.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Instructor</label>
              <Select value={form.instructorId} onValueChange={(value) => setForm((f) => ({ ...f, instructorId: value }))}>
                <SelectTrigger aria-label="Instructor" className="mt-2"><SelectValue /></SelectTrigger>
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
            <Textarea aria-label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-2 min-h-[100px]" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day</label>
              <Select value={form.dayOfWeek} onValueChange={(value) => setForm((f) => ({ ...f, dayOfWeek: value }))}>
                <SelectTrigger aria-label="Day" className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start</label>
              <Input aria-label="Start time" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">End</label>
              <Input aria-label="End time" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Capacity</label>
              <Input aria-label="Capacity" type="number" min={1} max={10000} required value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: Number(e.target.value) }))} className="mt-2" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Schedule active</p>
              <p className="text-xs text-muted-foreground">Inactive templates remain in records but stop representing active recurring classes.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
          </div>

          {error && <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save schedule'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
