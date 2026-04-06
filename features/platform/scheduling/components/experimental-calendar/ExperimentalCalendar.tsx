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
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Users, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { CalendarEvent, CalendarView } from "./types"

function getColorClasses(color?: string, isCancelled?: boolean) {
  if (isCancelled) return "border-zinc-700 bg-zinc-900/40 text-zinc-500"
  switch (color) {
    case "emerald":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
    case "orange":
      return "border-orange-500/40 bg-orange-500/10 text-orange-100"
    case "rose":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100"
    case "blue":
      return "border-blue-500/40 bg-blue-500/10 text-blue-100"
    default:
      return "border-violet-500/40 bg-violet-500/10 text-violet-100"
  }
}

function EventPill({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <Link
      href={event.rosterHref || "#"}
      className={cn(
        "block rounded-md border px-2 py-1.5 transition-colors hover:bg-white/10",
        getColorClasses(event.color, event.isCancelled),
        event.isCancelled && "line-through"
      )}
    >
      <div className={cn("font-bold uppercase tracking-[0.12em]", compact ? "text-[9px]" : "text-[10px]")}>{event.title}</div>
      <div className={cn("mt-1 flex items-center gap-2 text-[#b5b7b8]", compact ? "text-[8px]" : "text-[9px]")}>{format(event.start, "HH:mm")} · {event.capacity || "—"}</div>
    </Link>
  )
}

export function ExperimentalCalendar({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<CalendarView>("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const viewTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy")
    if (view === "week") return `Week of ${format(startOfWeek(currentDate), "MMM d, yyyy")}`
    if (view === "day") return format(currentDate, "EEEE, MMM d, yyyy")
    return `Agenda · ${format(currentDate, "MMM d")}`
  }, [currentDate, view])

  const handlePrevious = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1))
    else if (view === "week") setCurrentDate(subWeeks(currentDate, 1))
    else setCurrentDate(addDays(currentDate, -1))
  }

  const handleNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1))
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1))
    else setCurrentDate(addDays(currentDate, 1))
  }

  const getEventsForDay = (day: Date) =>
    events.filter((event) => isSameDay(new Date(event.start), day)).sort((a, b) => a.start.getTime() - b.start.getTime())

  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    return eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) })
  }, [currentDate])

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate)
    return eachDayOfInterval({ start, end: addDays(start, 6) })
  }, [currentDate])

  const agendaDays = useMemo(() => eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 13) }), [currentDate])
  const selectedDayEvents = getEventsForDay(view === "day" ? currentDate : selectedDate)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-[#111111] px-5 py-4 text-white">
        <div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.06em]">{viewTitle}</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Adapted from origin-space experiment-06</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevious} className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none h-10 w-10">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()) }} className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none px-4 text-[10px] font-black uppercase tracking-widest">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none h-10 w-10">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none gap-2 text-[10px] font-black uppercase tracking-widest">
                {view}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setView("month")}>Month</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("week")}>Week</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("day")}>Day</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("agenda")}>Agenda</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "month" && (
        <div className="grid grid-cols-7 border-l border-t border-white/10 bg-[#060606]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="border-b border-r border-white/10 bg-[#101010] py-3 text-center text-[10px] font-black uppercase tracking-[0.28em] text-[#6d7070]">
              {day}
            </div>
          ))}
          {monthDays.map((day, idx) => {
            const dayEvents = getEventsForDay(day)
            const selected = isSameDay(day, selectedDate)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "min-h-[132px] border-b border-r border-white/10 p-2 text-left transition-colors",
                  isSameMonth(day, currentDate) ? "bg-black hover:bg-[#111111]" : "bg-[#050505] opacity-30",
                  isToday(day) && "bg-[#23130e]",
                  selected && "bg-[#151311] ring-1 ring-[#ffb59e]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-[10px] font-black", isToday(day) ? "text-[#ffb59e]" : "text-[#8f9292]")}>{format(day, "d")}</span>
                  {dayEvents.length > 0 && <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#7df4ff]">{dayEvents.length}</span>}
                </div>
                <div className="mt-2 space-y-1.5">
                  {dayEvents.slice(0, 3).map((event) => <EventPill key={event.id} event={event} compact />)}
                  {dayEvents.length > 3 && <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">+ {dayEvents.length - 3} more</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {view === "week" && (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day)
            return (
              <div key={day.toISOString()} className={cn("border border-white/10 bg-[#0b0b0b] p-3", isToday(day) && "border-[#ffb59e]/40") }>
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">{format(day, "EEE")}</p>
                    <p className="mt-1 text-sm font-bold text-white">{format(day, "MMM d")}</p>
                  </div>
                  <Badge variant="outline" className="rounded-none border-white/10 text-[#8f9292]">{dayEvents.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {dayEvents.length === 0 ? <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6d7070]">No sessions</div> : dayEvents.map((event) => <EventPill key={event.id} event={event} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === "day" && (
        <div className="border border-white/10 bg-[#0b0b0b] p-5 text-white">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Day view</p>
              <h3 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em]">{format(currentDate, "EEEE, MMM d")}</h3>
            </div>
            <CalendarDays className="h-5 w-5 text-[#ffb59e]" />
          </div>
          <div className="mt-4 space-y-3">
            {getEventsForDay(currentDate).length === 0 ? (
              <div className="text-sm uppercase tracking-[0.16em] text-[#6d7070]">No sessions on this day.</div>
            ) : (
              getEventsForDay(currentDate).map((event) => <EventPill key={event.id} event={event} />)
            )}
          </div>
        </div>
      )}

      {view === "agenda" && (
        <div className="space-y-6 border border-white/10 bg-[#0b0b0b] p-5 text-white">
          {agendaDays.map((day) => {
            const dayEvents = getEventsForDay(day)
            if (dayEvents.length === 0) return null
            return (
              <div key={day.toISOString()} className="border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">{format(day, "EEE, MMM d")}</p>
                <div className="mt-3 space-y-2">
                  {dayEvents.map((event) => <EventPill key={event.id} event={event} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="border border-white/10 bg-[#111111] p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f9292]">Selected day</p>
              <h3 className="mt-2 font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em]">{format(selectedDate, "EEEE, MMM d")}</h3>
            </div>
            <Badge variant="outline" className="rounded-none border-[#7df4ff] text-[#7df4ff]">{selectedDayEvents.length} sessions</Badge>
          </div>
          <div className="mt-6 space-y-3">
            {selectedDayEvents.length === 0 ? (
              <div className="text-sm uppercase tracking-[0.16em] text-[#6d7070]">No sessions scheduled for this date.</div>
            ) : (
              selectedDayEvents.map((event) => (
                <div key={event.id} className="border border-white/10 bg-black px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-white">{event.title}</p>
                      <p className="mt-1 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f9292]">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {format(event.start, "HH:mm")} – {format(event.end, "HH:mm")}</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {event.capacity || "—"}</span>
                      </p>
                    </div>
                    <Link href={event.rosterHref || "#"} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb59e] hover:text-white">Open roster</Link>
                  </div>
                  {event.instructor && <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7df4ff]">Instructor · {event.instructor}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
