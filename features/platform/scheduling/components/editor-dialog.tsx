"use client"

/**
 * Layout for the scheduling editor dialogs: fixed header and footer with a
 * scrolling body, so long forms stay usable on short and phone viewports.
 */
import type { FormEvent, ReactNode } from "react"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function EditorDialogContent({
  title,
  description,
  onSubmit,
  error,
  footer,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  onSubmit: () => void
  error?: ReactNode
  footer: ReactNode
  children: ReactNode
  className?: string
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <DialogContent
      className={cn(
        "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl",
        className,
      )}
    >
      <DialogHeader className="shrink-0 border-b px-5 pb-4 pr-12 pt-5 text-left">
        <DialogTitle className="text-base">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-pretty text-xs leading-5">{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>
        {error ? <div className="shrink-0 border-t px-5 py-3">{error}</div> : null}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          {footer}
        </div>
      </form>
    </DialogContent>
  )
}

export function EditorSection({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 space-y-3">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
        {description ? <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Compact read-only summary line shown under a selector (template, inherited values). */
export function InheritedSummary({ items }: { items: Array<ReactNode | null | false | undefined> }) {
  const visible = items.filter(Boolean)
  if (!visible.length) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {visible.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden className="text-muted-foreground/50">·</span> : null}
          {item}
        </span>
      ))}
    </p>
  )
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function isClockTime(value: string) {
  return TIME_PATTERN.test(value)
}

export function minutesBetween(start: string, end: string) {
  if (!isClockTime(start) || !isClockTime(end)) return null
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

/** Adds minutes to an HH:MM wall time; returns null when it would cross midnight. */
export function addClockMinutes(value: string, minutes: number) {
  if (!isClockTime(value)) return null
  const [h, m] = value.split(":").map(Number)
  const total = h * 60 + m + minutes
  if (total >= 24 * 60) return null
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export function formatClock(value?: string | null) {
  if (!value || !isClockTime(value)) return value || "—"
  const [h, m] = value.split(":").map(Number)
  const suffix = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}
