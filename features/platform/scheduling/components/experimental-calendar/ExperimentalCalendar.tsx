"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { CalendarEvent, CalendarView } from "./types"

function toGymWallClock(value: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0)
  return new Date(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"))
}

function eventTone(color?: string, cancelled?: boolean) {
  if (cancelled) return "border-border bg-muted text-muted-foreground line-through"
  if (color === "emerald") return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
  if (color === "orange") return "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-100"
  if (color === "rose") return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100"
  if (color === "blue") return "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
  return "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100"
}

function EventRow({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <Link
      href={event.rosterHref || "#"}
      aria-label={`Open roster for ${event.title} at ${format(event.start, "h:mm a")}`}
      className={cn(
        "block min-w-0 rounded-md border px-2.5 py-2 text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        eventTone(event.color, event.isCancelled),
      )}
    >
      <span className={cn("block truncate font-semibold", compact ? "text-xs" : "text-sm")}>{event.title}</span>
      <span className="mt-1 flex min-w-0 items-center gap-2 text-xs opacity-75">
        <span>{format(event.start, "h:mm a")}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{event.capacity || "Capacity unavailable"}</span>
      </span>
    </Link>
  )
}

export function ExperimentalCalendar({ events, timeZone }: { events: CalendarEvent[]; timeZone: string }) {
  const [view, setView] = useState<CalendarView>("month")
  const [today] = useState(() => toGymWallClock(new Date(), timeZone))
  const [currentDate, setCurrentDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const wallEvents = useMemo(() => events.map((event) => ({
    ...event,
    start: toGymWallClock(event.start, timeZone),
    end: toGymWallClock(event.end, timeZone),
  })), [events, timeZone])

  const title = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy")
    if (view === "week") return `Week of ${format(startOfWeek(currentDate), "MMM d, yyyy")}`
    if (view === "day") return format(currentDate, "EEEE, MMM d, yyyy")
    return `Agenda from ${format(currentDate, "MMM d")}`
  }, [currentDate, view])

  const eventsForDay = (day: Date) =>
    wallEvents
      .filter((event) => isSameDay(event.start, day))
      .sort((left, right) => left.start.getTime() - right.start.getTime())

  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    return eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) })
  }, [currentDate])
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate)
    return eachDayOfInterval({ start, end: addDays(start, 6) })
  }, [currentDate])
  const agendaDays = useMemo(
    () => eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 13) }),
    [currentDate],
  )
  const selectedDayEvents = eventsForDay(view === "day" ? currentDate : selectedDate)

  const move = (direction: -1 | 1) => {
    if (view === "month") setCurrentDate((date) => direction < 0 ? subMonths(date, 1) : addMonths(date, 1))
    else if (view === "week") setCurrentDate((date) => direction < 0 ? subWeeks(date, 1) : addWeeks(date, 1))
    else setCurrentDate((date) => addDays(date, direction))
  }

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="schedule-calendar-title">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="schedule-calendar-title" className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select a date to inspect sessions, capacity, and roster links.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Calendar controls">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label={`Previous ${view}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const gymToday = toGymWallClock(new Date(), timeZone); setCurrentDate(gymToday); setSelectedDate(gymToday) }}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => move(1)} aria-label={`Next ${view}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 capitalize" aria-label={`Calendar view: ${view}`}>
                {view}<ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["month", "week", "day", "agenda"] as CalendarView[]).map((option) => (
                <DropdownMenuItem key={option} onSelect={() => setView(option)} className="capitalize">{option}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "month" ? (
        <div className="overflow-x-auto rounded-lg border bg-card" aria-label="Month calendar">
          <div className="grid min-w-[760px] grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="border-b border-r bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">{day}</div>
            ))}
            {monthDays.map((day) => {
              const dayEvents = eventsForDay(day)
              const selected = isSameDay(day, selectedDate)
              return (
                <div key={day.toISOString()} className={cn("min-h-32 border-b border-r p-2 last:border-r-0", !isSameMonth(day, currentDate) && "bg-muted/20 text-muted-foreground")}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    aria-pressed={selected}
                    className={cn("mb-2 flex h-8 w-full items-center justify-between rounded px-1.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", selected && "bg-foreground text-background", isSameDay(day, today) && !selected && "text-primary")}
                  >
                    <span>{format(day, "d")}</span><span>{dayEvents.length || ""}</span>
                  </button>
                  <div className="space-y-1.5">
                    {dayEvents.slice(0, 2).map((event) => <EventRow key={event.id} event={event} compact />)}
                    {dayEvents.length > 2 ? <p className="px-1 text-xs text-muted-foreground">+{dayEvents.length - 2} more</p> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((day) => {
            const dayEvents = eventsForDay(day)
            return (
              <div key={day.toISOString()} className={cn("min-w-0 rounded-lg border bg-card p-3", isSameDay(day, today) && "border-primary")}>
                <div className="mb-3 flex items-center justify-between border-b pb-3">
                  <div><p className="text-xs text-muted-foreground">{format(day, "EEE")}</p><p className="font-semibold">{format(day, "MMM d")}</p></div>
                  <Badge variant="outline">{dayEvents.length}</Badge>
                </div>
                <div className="space-y-2">{dayEvents.length ? dayEvents.map((event) => <EventRow key={event.id} event={event} />) : <p className="text-xs text-muted-foreground">No sessions</p>}</div>
              </div>
            )
          })}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between border-b pb-4"><div><p className="text-sm text-muted-foreground">Day view</p><h3 className="text-lg font-semibold">{format(currentDate, "EEEE, MMM d")}</h3></div><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
          <div className="mt-4 space-y-3">{selectedDayEvents.length ? selectedDayEvents.map((event) => <EventRow key={event.id} event={event} />) : <p className="text-sm text-muted-foreground">No sessions on this day.</p>}</div>
        </div>
      ) : null}

      {view === "agenda" ? (
        <div className="rounded-lg border bg-card p-5">
          <div className="space-y-5">
            {agendaDays.map((day) => {
              const dayEvents = eventsForDay(day)
              if (!dayEvents.length) return null
              return <div key={day.toISOString()} className="border-t pt-4 first:border-0 first:pt-0"><h3 className="mb-2 text-sm font-semibold">{format(day, "EEEE, MMM d")}</h3><div className="space-y-2">{dayEvents.map((event) => <EventRow key={event.id} event={event} />)}</div></div>
            })}
            {!agendaDays.some((day) => eventsForDay(day).length) ? <p className="text-sm text-muted-foreground">No sessions in this 14-day window.</p> : null}
          </div>
        </div>
      ) : null}

      {view !== "agenda" ? (
        <div className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm text-muted-foreground">Selected day</p><h3 className="text-lg font-semibold">{format(view === "day" ? currentDate : selectedDate, "EEEE, MMM d")}</h3></div>
            <Badge variant="outline">{selectedDayEvents.length} session{selectedDayEvents.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {selectedDayEvents.length ? selectedDayEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-semibold">{event.title}</p><p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{format(event.start, "h:mm a")}–{format(event.end, "h:mm a")}</span><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{event.capacity || "Capacity unavailable"}</span>{event.instructor ? <span>{event.instructor}</span> : null}</p></div>
                <Button asChild variant="outline" size="sm"><Link href={event.rosterHref || "#"}>Open roster</Link></Button>
              </div>
            )) : <p className="text-sm text-muted-foreground">No sessions scheduled for this date.</p>}
          </div>
        </div>
      ) : null}
    </section>
  )
}
