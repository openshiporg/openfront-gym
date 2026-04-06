export type CalendarView = "month" | "week" | "day" | "agenda"
export type EventColor = "blue" | "orange" | "violet" | "rose" | "emerald" | "zinc"

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  color?: EventColor
  description?: string
  instructor?: string
  capacity?: string
  rosterHref?: string
  isCancelled?: boolean
}
