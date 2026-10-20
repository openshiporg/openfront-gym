'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AlertCircle, Plus, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface DayRange {
  open: string
  close: string
}

export interface DaySchedule {
  enabled: boolean
  /** Open around the clock; admission never closes for a minute. */
  allDay?: boolean
  /** Saved hours were missing or unreadable: the owner must choose before hours can be saved. */
  unset?: boolean
  ranges: DayRange[]
}

export interface HoursState {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

interface WeeklyHoursEditorProps {
  days: Array<{ key: DayKey; label: string; short: string }>
  hours: HoursState
  locale: string
  timezone: string
  error: string | null
  onSetDayEnabled: (day: DayKey, enabled: boolean) => void
  onSetAllDay: (day: DayKey, allDay: boolean) => void
  onSetRangeValue: (day: DayKey, idx: number, key: 'open' | 'close', value: string) => void
  onAddRange: (day: DayKey) => void
  onRemoveRange: (day: DayKey, idx: number) => void
  onCopyDayToAll: (day: DayKey) => void
}

export function WeeklyHoursEditor({
  days,
  hours,
  error,
  onSetDayEnabled,
  onSetAllDay,
  onSetRangeValue,
  onAddRange,
  onRemoveRange,
  onCopyDayToAll,
}: WeeklyHoursEditorProps) {
  const [confirmCopyDay, setConfirmCopyDay] = useState<DayKey | null>(null)
  const jsDay = new Date().getDay()
  const todayKey = days[jsDay === 0 ? 6 : jsDay - 1].key

  return (
    <div>
      <ul className="divide-y">
        {days.map((day) => {
          const schedule = hours[day.key]
          const isToday = day.key === todayKey
          const switchId = `hours-${day.key}`
          return (
            <li
              key={day.key}
              className={cn(
                'grid gap-3 px-4 py-3 sm:px-5 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-start',
                isToday && 'bg-muted/30',
              )}
            >
              <div className="flex items-center justify-between gap-3 md:h-9 md:justify-start">
                <label htmlFor={switchId} className="flex items-center gap-2 text-sm font-medium">
                  {day.label}
                  {isToday ? (
                    <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-background">Today</span>
                  ) : null}
                </label>
                <Switch id={switchId} checked={schedule.enabled} onCheckedChange={(v) => onSetDayEnabled(day.key, v)} className="md:hidden" />
              </div>

              {schedule.unset ? (
                <p className="flex h-9 items-center text-sm text-amber-700 dark:text-amber-400">Not set. Turn the day on and choose times, or leave it closed.</p>
              ) : schedule.enabled && schedule.allDay ? (
                <p className="flex h-9 items-center text-sm">Open all day</p>
              ) : schedule.enabled ? (
                <div className="grid gap-2">
                  {schedule.ranges.map((range, idx) => (
                    <div key={`${day.key}-${idx}`} className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={1800}
                        aria-label={`${day.label} window ${idx + 1} opens`}
                        value={range.open}
                        onChange={(e) => onSetRangeValue(day.key, idx, 'open', e.target.value)}
                        className="h-9 w-32 px-3 text-sm tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        step={1800}
                        aria-label={`${day.label} window ${idx + 1} closes`}
                        value={range.close}
                        onChange={(e) => onSetRangeValue(day.key, idx, 'close', e.target.value)}
                        className="h-9 w-32 px-3 text-sm tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-rose-600"
                        onClick={() => onRemoveRange(day.key, idx)}
                        disabled={schedule.ranges.length <= 1}
                        aria-label={`Remove ${day.label} window ${idx + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="flex h-9 items-center text-sm text-muted-foreground">Closed all day</p>
              )}

              <div className="flex items-center gap-1 md:h-9">
                <Switch checked={schedule.enabled} onCheckedChange={(v) => onSetDayEnabled(day.key, v)} aria-label={`${day.label} open`} className="mr-2 hidden md:inline-flex" />
                {schedule.enabled ? (
                  <label className="mr-1 inline-flex h-8 items-center gap-1.5 px-1 text-xs">
                    <input type="checkbox" checked={Boolean(schedule.allDay)} onChange={(event) => onSetAllDay(day.key, event.target.checked)} className="size-3.5" />
                    All day
                  </label>
                ) : null}
                {schedule.enabled && !schedule.allDay ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onAddRange(day.key)}>
                    <Plus className="size-3.5" aria-hidden /> Split
                  </Button>
                ) : null}
                {confirmCopyDay === day.key ? (
                  <span className="inline-flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { onCopyDayToAll(day.key); setConfirmCopyDay(null) }}>
                      Apply to all 7 days
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setConfirmCopyDay(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => setConfirmCopyDay(day.key)}>
                    <Copy className="size-3.5" aria-hidden /> Copy to all
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error ? (
        <div className="flex items-center gap-2 border-t px-5 py-3 text-xs text-destructive">
          <AlertCircle size={12} />
          {error}
        </div>
      ) : null}
    </div>
  )
}
