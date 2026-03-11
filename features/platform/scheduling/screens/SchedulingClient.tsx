"use client"

import React, { useState } from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Users, 
  Clock, 
  MapPin, 
  MoreHorizontal,
  Info
} from "lucide-react"
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isToday
} from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Event {
  id: string
  title: string
  start: string
  end: string
  instructor: string
  capacity: string
  type: string
  isCancelled?: boolean
}

interface SchedulingClientProps {
  initialEvents: Event[]
  isInstructor?: boolean
}

export function SchedulingClient({ initialEvents, isInstructor }: SchedulingClientProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  })

  const getEventsForDay = (day: Date) => {
    return initialEvents.filter(event => isSameDay(new Date(event.start), day))
  }

  return (
    <div className="flex flex-col gap-6 h-full selection:bg-violet-500/30 selection:text-violet-200">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-zinc-950 border border-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">
            {format(currentMonth, "MMMM")} <span className="text-zinc-600">{format(currentMonth, "yyyy")}</span>
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Live Roster Syncing</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={prevMonth}
            className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none h-10 w-10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentMonth(new Date())}
            className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none px-4 text-[10px] font-black uppercase tracking-widest"
          >
            Today
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={nextMonth}
            className="border-white/10 bg-white/5 hover:bg-white/10 rounded-none h-10 w-10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="w-px h-8 bg-white/10 mx-2" />
          {!isInstructor && (
            <Button className="bg-white text-black hover:bg-violet-600 hover:text-white rounded-none h-10 px-6 text-[10px] font-black uppercase tracking-widest transition-all">
              <Plus className="mr-2 h-4 w-4" /> New Protocol
            </Button>
          )}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 border-l border-t border-white/5 bg-[#050505] shadow-2xl">
        {/* Day Names */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div 
            key={day} 
            className="border-b border-r border-white/5 bg-zinc-900/30 py-4 text-center text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600"
          >
            {day}
          </div>
        ))}

        {/* Days */}
        {calendarDays.map((day, i) => {
          const dayEvents = getEventsForDay(day)
          const isSelectedMonth = isSameMonth(day, monthStart)
          const isTodayDate = isToday(day)

          return (
            <div
              key={i}
              className={cn(
                "min-h-[140px] border-b border-r border-white/5 p-2 transition-colors relative group",
                !isSelectedMonth ? "bg-zinc-950/50 opacity-20" : "bg-black hover:bg-zinc-900/30",
                isTodayDate && "bg-violet-500/5"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "text-[10px] font-black tabular-nums tracking-tighter",
                  isTodayDate ? "bg-violet-600 px-1.5 py-0.5 text-white" : "text-zinc-500 group-hover:text-zinc-300"
                )}>
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 && isSelectedMonth && (
                  <span className="text-[8px] font-black text-violet-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    {dayEvents.length} Sessions
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <TooltipProvider key={event.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "flex flex-col border-l-2 p-1.5 transition-all cursor-pointer",
                            event.isCancelled 
                              ? "border-zinc-800 bg-zinc-900/50 opacity-50 line-through" 
                              : "border-violet-600 bg-violet-600/10 hover:bg-violet-600/20"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 overflow-hidden">
                            <span className="truncate text-[9px] font-black uppercase tracking-tight text-white">
                              {event.title}
                            </span>
                            <span className="shrink-0 text-[8px] font-bold tabular-nums text-violet-400">
                              {format(new Date(event.start), "HH:mm")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Users className="h-2 w-2 text-zinc-500" />
                            <span className="text-[8px] font-bold text-zinc-400">{event.capacity}</span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-black border border-white/10 p-4 rounded-none w-64 shadow-2xl">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <h4 className="text-sm font-black uppercase italic tracking-tighter text-white">{event.title}</h4>
                            <Badge variant="outline" className="text-[8px] border-violet-500 text-violet-400 rounded-none uppercase">
                              {event.type}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Clock className="h-3 w-3 text-violet-500" />
                              <span className="font-bold uppercase tracking-widest">
                                {format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Users className="h-3 w-3 text-violet-500" />
                              <span className="font-bold uppercase tracking-widest">Instructor: {event.instructor}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <MapPin className="h-3 w-3 text-violet-500" />
                              <span className="font-bold uppercase tracking-widest text-zinc-500">Main Lab - Zone A</span>
                            </div>
                          </div>
                          <Button size="sm" className="w-full bg-white text-black hover:bg-violet-600 hover:text-white rounded-none text-[9px] font-black uppercase tracking-widest h-8">
                            View Roster
                          </Button>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {dayEvents.length > 3 && (
                  <div className="flex items-center justify-center p-1 text-[8px] font-black uppercase tracking-widest text-zinc-600 bg-white/5 border border-white/5 group-hover:border-zinc-700 transition-colors">
                    + {dayEvents.length - 3} More Protocols
                  </div>
                )}
              </div>

              {/* Day Hover Detail Action */}
              <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/5 transition-colors pointer-events-none" />
            </div>
          )
        })}
      </div>
      
      {/* Legend / Status Footer */}
      <div className="flex items-center gap-6 p-4 border border-white/5 bg-zinc-950 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-violet-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Standard Op</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 border border-violet-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Peak Capacity</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-zinc-800 opacity-50" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Decommissioned</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          <Info className="h-3 w-3" />
          Data refreshes every 60 seconds
        </div>
      </div>
    </div>
  )
}
