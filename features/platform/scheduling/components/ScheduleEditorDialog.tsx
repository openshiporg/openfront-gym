"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock3 } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  FieldInput,
  FieldTextarea,
  FormField,
  NativeSelect,
  Notice,
  segmentedTrackClass,
} from "@/features/platform/components/platform-ui"
import { ToggleRow, confirmDiscard, sameDraft } from "@/features/platform/components/record-editor"
import { cn } from "@/lib/utils"
import { saveClassSchedule } from "../actions/scheduling"
import {
  EditorDialogContent,
  EditorSection,
  addClockMinutes,
  formatClock,
  formatDuration,
  isClockTime,
  minutesBetween,
} from "./editor-dialog"

const DAYS = [
  { value: "monday", short: "Mon", label: "Monday" },
  { value: "tuesday", short: "Tue", label: "Tuesday" },
  { value: "wednesday", short: "Wed", label: "Wednesday" },
  { value: "thursday", short: "Thu", label: "Thursday" },
  { value: "friday", short: "Fri", label: "Friday" },
  { value: "saturday", short: "Sat", label: "Saturday" },
  { value: "sunday", short: "Sun", label: "Sunday" },
]

const DURATION_PRESETS = [30, 45, 60, 75, 90]

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
  instancesCount?: number | null
}

type InstructorOption = {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

type ResourceOption = { id: string; name?: string | null; capacity?: number | null; location?: { id: string } | null }

function getInitialState(schedule?: ScheduleTemplate | null) {
  return {
    locationId: schedule?.location?.id || "none",
    resourceId: schedule?.resource?.id || "none",
    name: schedule?.name || "",
    description: schedule?.description || "",
    dayOfWeek: schedule?.dayOfWeek || "monday",
    startTime: schedule?.startTime || "07:00",
    endTime: schedule?.endTime || "08:00",
    maxCapacity: String(schedule?.maxCapacity ?? 12),
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
  const [initial, setInitial] = useState(() => getInitialState(schedule))
  const [form, setForm] = useState(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const next = getInitialState(schedule)
      setInitial(next)
      setForm(next)
      setError(null)
    }
  }, [open, schedule])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const dirty = !sameDraft(form, initial)
  const duration = minutesBetween(form.startTime, form.endTime)
  const capacity = Number(form.maxCapacity)
  const locationResources = useMemo(
    () => (resources as ResourceOption[]).filter((row) => form.locationId !== "none" && row.location?.id === form.locationId),
    [resources, form.locationId],
  )
  const selectedResource = locationResources.find((row) => row.id === form.resourceId)
  const overResource = Boolean(
    selectedResource?.capacity && Number.isFinite(capacity) && capacity > (selectedResource.capacity ?? 0),
  )
  const dayLabel = DAYS.find((day) => day.value === form.dayOfWeek)?.label ?? "Monday"
  // Generated sessions fix the slot, coach, class type and place; only presentation and capacity change.
  const locked = Boolean(schedule?.id && (schedule.instancesCount ?? 0) > 0)

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true)
    if (isSaving) return
    if (!confirmDiscard(dirty)) return
    onOpenChange(false)
  }

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
    if (!isClockTime(form.startTime) || !isClockTime(form.endTime) || form.endTime <= form.startTime) {
      setError("End time must be later than start time on the same day.")
      return
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
      setError("Capacity must be a whole number from 1 to 10000.")
      return
    }
    if (overResource) {
      setError(`Capacity is above ${selectedResource?.name || "this resource"}'s limit of ${selectedResource?.capacity}. Lower the capacity or choose a larger space.`)
      return
    }
    setIsSaving(true)

    try {
      const data: any = locked
        ? { name: form.name.trim(), description: form.description, maxCapacity: capacity, isActive: form.isActive }
        : {
            location: form.locationId === "none" ? { disconnect: true } : { connect: { id: form.locationId } },
            resource: form.resourceId === "none" ? { disconnect: true } : { connect: { id: form.resourceId } },
            name: form.name.trim(),
            description: form.description,
            dayOfWeek: form.dayOfWeek,
            startTime: form.startTime,
            endTime: form.endTime,
            maxCapacity: capacity,
            isActive: form.isActive,
            instructor: form.instructorId !== "unassigned" ? { connect: { id: form.instructorId } } : undefined,
            classType: { connect: { id: form.classTypeId } },
          }

      if (schedule?.id) {
        if (!locked && form.instructorId === "unassigned") {
          data.instructor = { disconnect: true }
        }
        const result = await saveClassSchedule(data, schedule.id)
        if (!result.ok) throw new Error(result.error)
      } else {
        const result = await saveClassSchedule(data)
        if (!result.ok) throw new Error(result.error)
      }

      onOpenChange(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || "Failed to save schedule")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <EditorDialogContent
        title={schedule ? `Edit ${schedule.name || "recurring schedule"}` : "New recurring schedule"}
        description={
          schedule
            ? "Changes apply to the weekly template. Sessions already on the calendar keep their own date, instructor, and place."
            : "A weekly class slot. Generate sessions from the calendar toolbar to put dated, bookable classes on the schedule."
        }
        onSubmit={save}
        error={error ? <Notice tone="danger" title="Schedule not saved">{error}</Notice> : null}
        footer={
          <>
            <span className="hidden text-xs text-muted-foreground sm:mr-auto sm:block" aria-live="polite">
              {dirty ? "Unsaved changes" : schedule ? "No changes yet" : ""}
            </span>
            <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || classTypes.length === 0}>
              {isSaving ? "Saving…" : schedule ? "Save template" : "Create template"}
            </Button>
          </>
        }
      >
        {locked ? (
          <Notice tone="info">
            This template has generated sessions, so its class type, instructor, weekly slot and place are fixed. Name, description,
            capacity and active state can still change. To move the slot, pause this template and create a new one; change a single
            date from Upcoming sessions.
          </Notice>
        ) : null}

        <EditorSection title="Class">
          {classTypes.length === 0 ? (
            <Notice
              tone="warning"
              title="No class types yet"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/platform/class-catalog">Open class catalog</Link>
                </Button>
              }
            >
              Every schedule belongs to a class type. Add one in the class catalog first.
            </Notice>
          ) : null}
          <FormField label="Class name" hint="Shown on the calendar, rosters, and the member schedule.">
            <FieldInput
              required
              maxLength={200}
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Morning HIIT"
              autoComplete="off"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Class type">
              <NativeSelect value={form.classTypeId} onChange={(event) => set("classTypeId", event.target.value)} required disabled={locked}>
                <option value="unassigned" disabled>
                  Select class type…
                </option>
                {classTypes.map((classType) => (
                  <option key={classType.id} value={classType.id}>
                    {classType.name || "Untitled class type"}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Instructor"
              hint={instructors.length === 0 ? "No active instructors yet. Add coaches on the Instructors page." : "Overlapping templates for the same coach are rejected."}
            >
              <NativeSelect value={form.instructorId} onChange={(event) => set("instructorId", event.target.value)} disabled={locked}>
                <option value="unassigned">Unassigned</option>
                {instructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.user?.name || inst.user?.email || "Unnamed instructor"}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Description" optional>
            <FieldTextarea
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Format, intensity, and what members should bring"
              rows={3}
            />
          </FormField>
        </EditorSection>

        <EditorSection title="Weekly slot" description={`Repeats every ${dayLabel}${duration && duration > 0 ? `, ${formatClock(form.startTime)}–${formatClock(form.endTime)}` : ""}.`}>
          <fieldset className="min-w-0 disabled:opacity-60" disabled={locked}>
            <legend className="mb-1.5 text-xs font-medium text-foreground">Day of week</legend>
            <div data-seg-track className={cn(segmentedTrackClass, "gap-0.5 rounded-lg border bg-muted/50 p-0.5")}>
              {DAYS.map((day) => (
                <label key={day.value}>
                  <input
                    type="radio"
                    name="schedule-day"
                    value={day.value}
                    checked={form.dayOfWeek === day.value}
                    onChange={() => set("dayOfWeek", day.value)}
                    className="peer sr-only"
                  />
                  <span
                    title={day.label}
                    className="flex h-8 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-xs peer-checked:ring-1 peer-checked:ring-border peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                  >
                    {day.short}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-end">
            <FormField label="Starts">
              <FieldInput type="time" step={300} required value={form.startTime} onChange={(event) => set("startTime", event.target.value)} className="tabular-nums" disabled={locked} />
            </FormField>
            <FormField label="Ends">
              <FieldInput type="time" step={300} required value={form.endTime} onChange={(event) => set("endTime", event.target.value)} className="tabular-nums" disabled={locked} />
            </FormField>
            <p
              className={cn(
                "col-span-2 flex h-9 items-center gap-1.5 rounded-md border border-dashed px-3 text-xs sm:col-span-1",
                duration !== null && duration <= 0 ? "border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-400" : "text-muted-foreground",
              )}
              aria-live="polite"
            >
              <Clock3 className="size-3.5 shrink-0" aria-hidden />
              {duration === null ? "Enter both times" : duration <= 0 ? "Ends before it starts" : formatDuration(duration)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Set length from start time">
            <span className="mr-1 text-xs text-muted-foreground">Length</span>
            {DURATION_PRESETS.map((minutes) => {
              const end = addClockMinutes(form.startTime, minutes)
              const active = duration === minutes
              return (
                <button
                  key={minutes}
                  type="button"
                  disabled={!end || locked}
                  aria-pressed={active}
                  onClick={() => end && set("endTime", end)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {minutes} min
                </button>
              )
            })}
          </div>
        </EditorSection>

        <EditorSection title="Place and capacity" description="A room or resource must belong to the chosen location and hold at least the class capacity.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
            <FormField label="Location" hint={locations.length === 0 ? "No active locations yet." : undefined}>
              <NativeSelect
                value={form.locationId}
                onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value, resourceId: "none" }))}
                disabled={locked}
              >
                <option value="none">Unassigned</option>
                {locations.map((row: any) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Room or resource"
              hint={
                form.locationId === "none"
                  ? "Choose a location first."
                  : locationResources.length === 0
                    ? "No active rooms at this location."
                    : undefined
              }
            >
              <NativeSelect
                value={form.resourceId}
                onChange={(event) => set("resourceId", event.target.value)}
                disabled={locked || form.locationId === "none" || locationResources.length === 0}
              >
                <option value="none">None</option>
                {locationResources.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · holds {row.capacity}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Capacity">
              <FieldInput
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                required
                value={form.maxCapacity}
                onChange={(event) => set("maxCapacity", event.target.value)}
                aria-invalid={overResource || undefined}
                className="tabular-nums"
              />
            </FormField>
          </div>
          {overResource ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
              {selectedResource?.name} holds {selectedResource?.capacity}. Lower the capacity or choose a larger space.
            </p>
          ) : null}
        </EditorSection>

        <EditorSection title="Status">
          <ToggleRow
            id="schedule-active"
            label="Active template"
            description="Paused templates stay on record but stop generating sessions and no longer reserve the coach or room."
            checked={form.isActive}
            onCheckedChange={(checked) => set("isActive", checked)}
          />
        </EditorSection>
      </EditorDialogContent>
    </Dialog>
  )
}
