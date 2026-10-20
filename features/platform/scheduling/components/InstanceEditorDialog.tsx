"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  FieldInput,
  FormField,
  NativeSelect,
  Notice,
} from "@/features/platform/components/platform-ui"
import { confirmDiscard, sameDraft } from "@/features/platform/components/record-editor"
import { saveClassInstance } from "../actions/scheduling"
import { exactLocalTimeToUtc, localDateParts } from "@/lib/timezone"
import {
  EditorDialogContent,
  EditorSection,
  InheritedSummary,
  formatClock,
  formatDuration,
  minutesBetween,
} from "./editor-dialog"

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const WEEKDAY_BY_UTC_INDEX = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

type NamedRef = { id: string; name?: string | null } | null

type ScheduleTemplate = {
  id: string
  name: string
  dayOfWeek?: string
  startTime: string
  endTime: string
  maxCapacity: number
  isActive?: boolean
  location?: NamedRef
  resource?: NamedRef
  instructor?: { id: string; user?: { name?: string | null } | null } | null
}

type InstructorOption = {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

type ResourceOption = { id: string; name?: string | null; capacity?: number | null; location?: { id: string } | null }

type InstanceRecord = {
  location?: NamedRef
  resource?: NamedRef
  id: string
  date: string
  maxCapacity?: number | null
  bookingsCount?: number | null
  classSchedule?: {
    id: string
    name?: string | null
    startTime?: string | null
    maxCapacity?: number | null
    instructor?: { id?: string; user?: { name?: string | null } | null } | null
  } | null
  instructor?: { id: string; user?: { name?: string | null } | null } | null
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
    maxCapacity: String(instance?.maxCapacity ?? instance?.classSchedule?.maxCapacity ?? schedule?.maxCapacity ?? 12),
  }
}

function capitalize(value?: string | null) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ""
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
  const [initial, setInitial] = useState(() => getInitial(defaultSchedule, instance, timeZone))
  const [form, setForm] = useState(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedAt, setOpenedAt] = useState(0)

  useEffect(() => {
    if (open) {
      const next = getInitial(defaultSchedule, instance, timeZone)
      setInitial(next)
      setForm(next)
      setError(null)
      setOpenedAt(Date.now())
    }
  }, [open, defaultSchedule, instance, timeZone])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const day = DAY_ORDER.indexOf(a.dayOfWeek || "") - DAY_ORDER.indexOf(b.dayOfWeek || "")
        return day !== 0 ? day : a.startTime.localeCompare(b.startTime)
      }),
    [schedules],
  )
  const template = schedules.find((row) => row.id === form.scheduleId) ?? null
  const isEditing = Boolean(instance?.id)
  const dirty = !sameDraft(form, initial)
  const booked = instance?.bookingsCount ?? 0
  const capacity = Number(form.maxCapacity)
  const templateCapacity = template?.maxCapacity ?? instance?.classSchedule?.maxCapacity ?? null
  const templateInstructorName = template?.instructor?.user?.name ?? instance?.classSchedule?.instructor?.user?.name ?? null
  const templateLength = template ? minutesBetween(template.startTime, template.endTime) : null

  // Location/resource "default" keeps the session's current place, or the template's for a new session.
  const inheritedLocation = (isEditing ? instance?.location : null) ?? template?.location ?? null
  const inheritedResource = (isEditing ? instance?.resource : null) ?? template?.resource ?? null
  const effectiveLocationId =
    form.locationId === "default" ? inheritedLocation?.id ?? null : form.locationId === "none" ? null : form.locationId
  const locationResources = (resources as ResourceOption[]).filter(
    (row) => effectiveLocationId && row.location?.id === effectiveLocationId,
  )
  const effectiveResource =
    form.resourceId === "default"
      ? (resources as ResourceOption[]).find((row) => row.id === inheritedResource?.id) ?? null
      : form.resourceId === "none"
        ? null
        : locationResources.find((row) => row.id === form.resourceId) ?? null
  const overResource = Boolean(effectiveResource?.capacity && Number.isFinite(capacity) && capacity > (effectiveResource.capacity ?? 0))
  const belowBooked = isEditing && Number.isFinite(capacity) && capacity < booked

  const parsed = `${form.date}T${form.time}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  // An existing session whose date and time weren't touched keeps its exact stored instant (even
  // in a repeated daylight-saving hour); only an explicit change chooses a new instant.
  const timeTouched = !isEditing || form.date !== initial.date || form.time !== initial.time
  let startsAt: Date | null = null
  let startTimeProblem: string | null = null
  let repeatedHour = false
  if (!timeTouched && instance) {
    startsAt = new Date(instance.date)
  } else if (parsed) {
    try {
      // A wall time skipped by a daylight-saving change is rejected rather than shifted; one that
      // happens twice uses its first (earlier) occurrence, and the editor says so.
      startsAt = exactLocalTimeToUtc(
        { year: Number(parsed[1]), month: Number(parsed[2]), day: Number(parsed[3]), hour: Number(parsed[4]), minute: Number(parsed[5]), second: 0 },
        timeZone,
      )
      const later = localDateParts(new Date(startsAt.getTime() + 3_600_000), timeZone)
      repeatedHour = later.year === Number(parsed[1]) && later.month === Number(parsed[2]) && later.day === Number(parsed[3]) && later.hour === Number(parsed[4]) && later.minute === Number(parsed[5])
    } catch (problem) {
      startTimeProblem = problem instanceof Error ? problem.message : "Choose a valid class date and start time."
    }
  }
  // The end the server will store: the actual start plus the template's elapsed length.
  const endsAtInstant = startsAt && templateLength && templateLength > 0 ? new Date(startsAt.getTime() + templateLength * 60_000) : null
  const zoned = (value: Date, withDate: boolean) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(withDate ? { weekday: "short", month: "short", day: "numeric" } : {}) }).format(value)
  const endsOnAnotherDay = Boolean(startsAt && endsAtInstant && new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt) !== new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(endsAtInstant))
  const inPast = Boolean(startsAt && openedAt && startsAt.getTime() <= openedAt)
  const chosenWeekday = parsed ? WEEKDAY_BY_UTC_INDEX[new Date(`${form.date}T12:00:00Z`).getUTCDay()] : null
  const offTemplateDay = Boolean(template?.dayOfWeek && chosenWeekday && chosenWeekday !== template.dayOfWeek)

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true)
    if (isSaving) return
    if (!confirmDiscard(dirty)) return
    onOpenChange(false)
  }

  const chooseTemplate = (scheduleId: string) => {
    const next = schedules.find((row) => row.id === scheduleId)
    setForm((current) => ({
      ...current,
      scheduleId,
      // A new session starts from the template's own slot and size; the operator can still adjust both.
      ...(next && !isEditing ? { time: next.startTime, maxCapacity: String(next.maxCapacity) } : {}),
      locationId: "default",
      resourceId: "default",
    }))
  }

  const save = async () => {
    setError(null)
    if (!form.scheduleId) {
      setError("Choose the recurring template this session belongs to.")
      return
    }
    if (!parsed || !startsAt) {
      setError(startTimeProblem || "Choose a valid class date and start time.")
      return
    }
    if (inPast) {
      setError(`That start time has already passed in ${timeZone}. Sessions must start in the future.`)
      return
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
      setError("Capacity must be a whole number from 1 to 10000.")
      return
    }
    if (belowBooked) {
      setError(`${booked} members are already confirmed. Capacity cannot go below that.`)
      return
    }
    if (overResource) {
      setError(`Capacity is above ${effectiveResource?.name || "this resource"}'s limit of ${effectiveResource?.capacity}.`)
      return
    }
    setIsSaving(true)

    try {
      const data: any = {
        ...(form.locationId === "none" ? { location: { disconnect: true } } : form.locationId !== "default" ? { location: { connect: { id: form.locationId } } } : {}),
        ...(form.resourceId === "none" ? { resource: { disconnect: true } } : form.resourceId !== "default" ? { resource: { connect: { id: form.resourceId } } } : {}),
        classSchedule: { connect: { id: form.scheduleId } },
        // Capacity, coach or place edits leave the stored start untouched.
        ...(timeTouched ? { date: startsAt.toISOString() } : {}),
        maxCapacity: capacity,
      }

      if (form.instructorId !== "default") {
        data.instructor = { connect: { id: form.instructorId } }
      } else if (instance?.id) {
        data.instructor = { disconnect: true }
      }

      const result = instance?.id ? await saveClassInstance(data, instance.id) : await saveClassInstance(data)
      if (!result.ok) throw new Error(result.error)
      onOpenChange(false)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || "Failed to save class session")
    } finally {
      setIsSaving(false)
    }
  }

  const sessionLabel = instance?.classSchedule?.name || template?.name || "class session"

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <EditorDialogContent
        title={isEditing ? `Edit ${sessionLabel}` : "One-off session"}
        description={
          isEditing
            ? "Changes apply to this date only. The recurring template and its other sessions stay as they are."
            : "Adds a single dated, bookable session from a recurring template, such as a holiday class or a make-up slot."
        }
        onSubmit={save}
        error={error ? <Notice tone="danger" title="Session not saved">{error}</Notice> : null}
        footer={
          <>
            <span className="hidden text-xs text-muted-foreground sm:mr-auto sm:block" aria-live="polite">
              {dirty ? "Unsaved changes" : isEditing ? "No changes yet" : ""}
            </span>
            <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !form.scheduleId}>
              {isSaving ? "Saving…" : isEditing ? "Save session" : "Create session"}
            </Button>
          </>
        }
      >
        {isEditing && booked > 0 ? (
          <Notice tone="warning" title={`${booked} member${booked === 1 ? " is" : "s are"} booked`}>
            Changing the date, time, coach, or place adds a reschedule notice for each booked member to Operations
            follow-up. A move into a different credit month is rejected. Cancel and rebook instead.
          </Notice>
        ) : null}

        <EditorSection title="Class">
          {schedules.length === 0 ? (
            <Notice tone="warning" title="No recurring templates yet">
              One-off sessions borrow their class, type, and defaults from a template. Create a recurring schedule first.
            </Notice>
          ) : (
            <FormField
              label="Recurring template"
              hint={isEditing ? "A session cannot move to another template. Cancel it and create a new one instead." : undefined}
            >
              <NativeSelect value={form.scheduleId} onChange={(event) => chooseTemplate(event.target.value)} disabled={isEditing} required>
                <option value="" disabled>
                  Choose a template…
                </option>
                {sortedSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id} disabled={!isEditing && schedule.isActive === false}>
                    {schedule.name} · {capitalize(schedule.dayOfWeek).slice(0, 3)} {formatClock(schedule.startTime)}
                    {schedule.isActive === false ? " (paused)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          {template ? (
            <InheritedSummary
              items={[
                template.dayOfWeek ? `${capitalize(template.dayOfWeek)}s` : null,
                `${formatClock(template.startTime)}–${formatClock(template.endTime)}`,
                `${template.maxCapacity} spots`,
                templateInstructorName ? `Coach ${templateInstructorName}` : "No template coach",
                template.location?.name ?? null,
              ]}
            />
          ) : null}
        </EditorSection>

        <EditorSection title="Date and time" description={`Times are in the gym's time zone, ${timeZone}.`}>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <FieldInput type="date" required value={form.date} onChange={(event) => set("date", event.target.value)} className="tabular-nums" />
            </FormField>
            <FormField label="Starts">
              <FieldInput type="time" step={300} required value={form.time} onChange={(event) => set("time", event.target.value)} className="tabular-nums" />
            </FormField>
          </div>
          <div className="space-y-1 text-xs" aria-live="polite">
            {templateLength && templateLength > 0 ? (
              <p className="text-muted-foreground">
                {endsAtInstant ? `Ends ${zoned(endsAtInstant, endsOnAnotherDay)}` : "Choose a valid start to see the end"} · {formatDuration(templateLength)}, the template length
              </p>
            ) : null}
            {repeatedHour && startsAt ? (
              <p className="text-muted-foreground">This time happens twice on that date because of a daylight-saving change. The session starts at the first one, {zoned(startsAt, false)}.</p>
            ) : null}
            {offTemplateDay && template?.dayOfWeek && chosenWeekday ? (
              <p className="text-muted-foreground">
                This template usually runs on {capitalize(template.dayOfWeek)}s. This session falls on a {capitalize(chosenWeekday)}.
              </p>
            ) : null}
            {inPast ? (
              <p className="font-medium text-rose-700 dark:text-rose-400">This start time has already passed. Choose a future date or time.</p>
            ) : null}
          </div>
        </EditorSection>

        <EditorSection title="Overrides" description="Leave a field on its default to follow the template. Coach and room clashes with other sessions are rejected on save.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <FormField label="Coach" hint={instructors.length === 0 ? "No active instructors yet." : undefined}>
              <NativeSelect value={form.instructorId} onChange={(event) => set("instructorId", event.target.value)}>
                <option value="default">{templateInstructorName ? `Template coach (${templateInstructorName})` : "Template coach (none)"}</option>
                {instructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.user?.name || inst.user?.email || "Unnamed instructor"}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Capacity" hint={templateCapacity !== null ? `Template: ${templateCapacity}` : undefined}>
              <FieldInput
                type="number"
                inputMode="numeric"
                min={Math.max(1, booked)}
                max={10000}
                required
                value={form.maxCapacity}
                onChange={(event) => set("maxCapacity", event.target.value)}
                aria-invalid={belowBooked || overResource || undefined}
                className="tabular-nums"
              />
            </FormField>
          </div>
          {belowBooked ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
              {booked} members are confirmed. Capacity cannot go below that.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Location">
              <NativeSelect
                value={form.locationId}
                onChange={(event) => {
                  const locationId = event.target.value
                  // A room only carries over while the location does; otherwise it must be re-picked at the new place.
                  setForm((current) => ({ ...current, locationId, resourceId: locationId === "default" ? "default" : "none" }))
                }}
              >
                <option value="default">
                  {isEditing ? "Keep current" : "Template location"}
                  {inheritedLocation?.name ? ` (${inheritedLocation.name})` : " (none)"}
                </option>
                <option value="none">No location</option>
                {locations.map((row: any) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Room or resource"
              hint={!effectiveLocationId ? "Rooms are tied to a location. Choose one to pick a room." : undefined}
            >
              <NativeSelect value={form.resourceId} onChange={(event) => set("resourceId", event.target.value)}>
                {form.locationId === "default" || form.resourceId === "default" ? (
                  <option value="default">
                    {isEditing ? "Keep current" : "Template room"}
                    {inheritedResource?.name ? ` (${inheritedResource.name})` : " (none)"}
                  </option>
                ) : null}
                <option value="none">No room</option>
                {locationResources.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · holds {row.capacity}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {overResource ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
              {effectiveResource?.name} holds {effectiveResource?.capacity}. Lower the capacity or choose a larger room.
            </p>
          ) : null}
        </EditorSection>
      </EditorDialogContent>
    </Dialog>
  )
}
