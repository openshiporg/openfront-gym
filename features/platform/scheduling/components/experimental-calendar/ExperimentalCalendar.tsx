"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
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
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { CalendarEvent, CalendarView } from "./types"

// Sessions stay business-local: their calendar day and clock labels come from the gym's zone and
// are never rebuilt as viewer-local Dates, which a viewer's own DST change would shift.
type WallEvent = CalendarEvent & { dayKey: string; startLabel: string; endLabel: string }

function gymDayKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value)
}

function gymClock(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(value)
}

const PHONE_QUERY = "(max-width: 639px)"
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/** A calendar-grid day for a business-local date key; only its date is ever read. */
function gridDay(dayKey: string) {
  return parseISO(dayKey)
}

const eventRail: Record<string, string> = {
  emerald: "before:bg-emerald-500",
  orange: "before:bg-orange-500",
  rose: "before:bg-rose-500",
  blue: "before:bg-sky-500",
  violet: "before:bg-violet-500",
  zinc: "before:bg-zinc-400",
}

function eventTone(color?: string, cancelled?: boolean) {
  if (cancelled) return "bg-muted/60 text-muted-foreground line-through before:bg-muted-foreground/40"
  return cn("bg-background text-foreground hover:bg-muted/60", eventRail[color || "violet"] || eventRail.violet)
}

function EventRow({ event, compact = false }: { event: WallEvent; compact?: boolean }) {
  return (
    <Link
      href={event.rosterHref || "#"}
      aria-label={`Open roster for ${event.title} at ${event.startLabel}`}
      className={cn(
        "relative block min-w-0 overflow-hidden rounded-md border py-1.5 pl-3 pr-2 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        eventTone(event.color, event.isCancelled),
      )}
    >
      <span className={cn("block truncate font-medium", compact ? "text-[11px] leading-4" : "text-sm")}>{event.title}</span>
      <span className={cn("flex min-w-0 items-center gap-1.5 text-muted-foreground", compact ? "text-[10px] leading-4" : "mt-0.5 text-xs")}>
        <span className="tabular-nums">{event.startLabel}</span>
        {!compact ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{event.capacity || "Capacity unavailable"}</span>
          </>
        ) : null}
      </span>
    </Link>
  )
}

function parseDayKey(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function ExperimentalCalendar({
  events,
  timeZone,
  loadedWindow,
  initialDate,
  onWindowRequest,
  loading = false,
  complete = true,
}: {
  events: CalendarEvent[]
  timeZone: string
  /** Gym-local YYYY-MM-DD bounds of the sessions currently loaded. */
  loadedWindow?: { from: string; to: string }
  initialDate?: string
  /** Asks the page to load sessions starting at this gym-local day. */
  onWindowRequest?: (from: string) => void
  loading?: boolean
  /** False when the loaded window stopped before its end: an empty day there is unknown, not empty. */
  complete?: boolean
}) {
  // Month grids need horizontal scrolling on phones, so phones start on the agenda until a view is chosen.
  const isPhone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)
  const [chosenView, setView] = useState<CalendarView | null>(null)
  const view: CalendarView = chosenView ?? (isPhone ? "agenda" : "month")
  const [today] = useState(() => gridDay(gymDayKey(new Date(), timeZone)))
  const [currentDate, setCurrentDate] = useState(() => parseDayKey(initialDate) ?? today)
  const [selectedDate, setSelectedDate] = useState(() => parseDayKey(initialDate) ?? today)
  const lastRequest = useRef<string | null>(null)

  const wallEvents = useMemo<WallEvent[]>(() => events.map((event) => ({
    ...event,
    dayKey: gymDayKey(event.start, timeZone),
    startLabel: gymClock(event.start, timeZone),
    endLabel: gymClock(event.end, timeZone),
  })), [events, timeZone])

  const title = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy")
    if (view === "week") return `Week of ${format(startOfWeek(currentDate), "MMM d, yyyy")}`
    if (view === "day") return format(currentDate, "EEEE, MMM d, yyyy")
    return `Agenda from ${format(currentDate, "MMM d")}`
  }, [currentDate, view])

  const eventsForDay = (day: Date) => {
    const key = format(day, "yyyy-MM-dd")
    return wallEvents
      .filter((event) => event.dayKey === key)
      .sort((left, right) => left.start.getTime() - right.start.getTime())
  }

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

  const visibleRange = useMemo<[Date, Date]>(() => {
    if (view === "month") return [monthDays[0], monthDays[monthDays.length - 1]]
    if (view === "week") return [weekDays[0], weekDays[weekDays.length - 1]]
    if (view === "day") return [currentDate, currentDate]
    return [agendaDays[0], agendaDays[agendaDays.length - 1]]
  }, [view, monthDays, weekDays, agendaDays, currentDate])
  const visibleFrom = format(visibleRange[0], "yyyy-MM-dd")
  const visibleTo = format(visibleRange[1], "yyyy-MM-dd")
  const outsideWindow = Boolean(loadedWindow && (visibleFrom < loadedWindow.from || visibleTo > loadedWindow.to))
  const requestFrom = view === "month" ? format(startOfMonth(currentDate), "yyyy-MM-dd") : visibleFrom

  useEffect(() => {
    if (!outsideWindow || !onWindowRequest || lastRequest.current === requestFrom) return
    lastRequest.current = requestFrom
    onWindowRequest(requestFrom)
  }, [outsideWindow, onWindowRequest, requestFrom])

  const pendingRange = outsideWindow || loading
  // "No sessions" is claimed only for a range that finished loading completely.
  const emptyText = (fallback: string) => pendingRange ? "Loading sessions…" : !complete ? "Not all sessions in this range could be shown" : fallback

  const move = (direction: -1 | 1) => {
    if (view === "month") setCurrentDate((date) => direction < 0 ? subMonths(date, 1) : addMonths(date, 1))
    else if (view === "week") setCurrentDate((date) => direction < 0 ? subWeeks(date, 1) : addWeeks(date, 1))
    else setCurrentDate((date) => addDays(date, direction))
  }

  // The selected day's sessions sit inside the month, week and day panels.
  const dayDetails = (
        <div className="border-t">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-4 py-2.5 sm:px-5">
            <h3 className="text-sm font-semibold">{format(view === "day" ? currentDate : selectedDate, "EEEE, MMM d")}</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{selectedDayEvents.length} session{selectedDayEvents.length === 1 ? "" : "s"}</span>
          </div>
          {selectedDayEvents.length ? (
            <ul className="divide-y">
              {selectedDayEvents.map((event) => (
                <li key={event.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{event.startLabel}</span>
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-medium", event.isCancelled && "text-muted-foreground line-through")}>{event.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />until {event.endLabel}</span>
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{event.capacity || "Capacity unavailable"}</span>
                        {event.instructor ? <span>{event.instructor}</span> : null}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="self-start sm:self-auto"><Link href={event.rosterHref || "#"}>Open roster</Link></Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden /> {emptyText("No sessions scheduled for this date.")}
            </div>
          )}
        </div>
  )

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)} asChild>
    <section className="min-w-0 overflow-hidden rounded-lg border bg-background text-foreground" aria-labelledby="schedule-calendar-title">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center rounded-lg border bg-background p-0.5" aria-label="Calendar navigation">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => move(-1)} aria-label={`Previous ${view}`}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => { const gymToday = gridDay(gymDayKey(new Date(), timeZone)); setCurrentDate(gymToday); setSelectedDate(gymToday) }}>Today</Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => move(1)} aria-label={`Next ${view}`}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 id="schedule-calendar-title" className="truncate text-base font-semibold tracking-tight">{title}</h2>
          {pendingRange ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span className="hidden sm:inline">Loading sessions…</span>
            </span>
          ) : !complete ? (
            <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400" role="status">Too many sessions to show every one; open a shorter range</span>
          ) : null}
        </div>
        <TabsList aria-label="Calendar view" className="h-8 gap-0.5 rounded-lg border bg-muted/50 p-0.5">
          {(["month", "week", "day", "agenda"] as CalendarView[]).map((option) => (
            <TabsTrigger key={option} value={option} className="h-7 rounded-md px-3 text-xs font-medium capitalize">
              {option}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className={cn("transition-opacity", pendingRange && "pointer-events-none opacity-50")} aria-busy={pendingRange || undefined}>
      <TabsContent value="month" className="mt-0">
        <div className="overflow-x-auto" aria-label="Month calendar">
          <div className="grid min-w-[720px] grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="border-b border-r bg-muted/40 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground last:border-r-0">{day}</div>
            ))}
            {monthDays.map((day, index) => {
              const dayEvents = eventsForDay(day)
              const selected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, today)
              const outside = !isSameMonth(day, currentDate)
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-28 border-b border-r p-1.5",
                    (index + 1) % 7 === 0 && "border-r-0",
                    outside && "bg-muted/25",
                    selected && "bg-muted/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    aria-pressed={selected}
                    aria-label={`${format(day, "EEEE, MMMM d")}: ${dayEvents.length} session${dayEvents.length === 1 ? "" : "s"}`}
                    className="mb-1 flex h-7 w-full items-center justify-between rounded px-1 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full tabular-nums",
                        isToday ? "bg-foreground font-semibold text-background" : outside ? "text-muted-foreground" : "font-medium text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length ? <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{dayEvents.length}</span> : null}
                  </button>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => <EventRow key={event.id} event={event} compact />)}
                    {dayEvents.length > 2 ? (
                      <button type="button" onClick={() => setSelectedDate(day)} className="px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                        +{dayEvents.length - 2} more
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {dayDetails}
      </TabsContent>

      <TabsContent value="week" className="mt-0">
        <div className="grid min-w-0 divide-y sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-7 xl:divide-x">
          {weekDays.map((day) => {
            const dayEvents = eventsForDay(day)
            const isToday = isSameDay(day, today)
            return (
              <div key={day.toISOString()} className={cn("min-w-0 p-3", isToday && "bg-muted/40")}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{format(day, "EEE")}</p>
                    <p className={cn("text-sm font-semibold tabular-nums", isToday && "underline decoration-2 underline-offset-4")}>{format(day, "MMM d")}</p>
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{dayEvents.length || ""}</span>
                </div>
                <div className="space-y-1.5">{dayEvents.length ? dayEvents.map((event) => <EventRow key={event.id} event={event} />) : <p className="py-2 text-xs text-muted-foreground">{emptyText("No sessions")}</p>}</div>
              </div>
            )
          })}
        </div>
        {dayDetails}
      </TabsContent>

      <TabsContent value="day" className="mt-0">{dayDetails}</TabsContent>

      <TabsContent value="agenda" className="mt-0">
        <div className="divide-y">
          {agendaDays.map((day) => {
            const dayEvents = eventsForDay(day)
            if (!dayEvents.length) return null
            return (
              <div key={day.toISOString()} className="grid gap-3 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-5">
                <h3 className="text-sm font-semibold">{format(day, "EEE, MMM d")}{isSameDay(day, today) ? <span className="ml-2 text-[11px] font-medium text-muted-foreground">Today</span> : null}</h3>
                <div className="grid gap-1.5 md:grid-cols-2">{dayEvents.map((event) => <EventRow key={event.id} event={event} />)}</div>
              </div>
            )
          })}
          {!agendaDays.some((day) => eventsForDay(day).length) ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyText("No sessions in this 14-day window.")}</p> : null}
        </div>
      </TabsContent>


      </div>
    </section>
    </Tabs>
  )
}
