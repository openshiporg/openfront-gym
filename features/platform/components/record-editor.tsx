'use client'

/**
 * Master–detail editor building blocks shared by the catalog-style platform
 * pages (class catalog, instructors, locations, membership plans).
 */
import { useEffect, type ReactNode } from 'react'
import { Check, Plus, Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { CountBadge, FieldInput, Notice } from './platform-ui'

export function sameDraft(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Ask before discarding edits when the operator switches records. */
export function confirmDiscard(dirty: boolean) {
  return !dirty || window.confirm('Discard unsaved changes to this record?')
}

/** Browser-level guard so a refresh or tab close does not silently drop edits. */
/**
 * Warns before unsaved edits are lost: on reload or closing the tab, and on in-app links (the
 * sidebar, breadcrumbs, any page link), which a browser unload warning never sees.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const next = new URL(link.href, window.location.href)
      if (next.origin !== window.location.origin || (next.pathname === window.location.pathname && next.search === window.location.search)) return
      if (window.confirm('You have unsaved changes. Leave this page without saving them?')) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', handler)
    // Capture phase, so the check runs before client-side navigation handles the click.
    document.addEventListener('click', onLinkClick, true)
    return () => {
      window.removeEventListener('beforeunload', handler)
      document.removeEventListener('click', onLinkClick, true)
    }
  }, [dirty])
}

export function EditorLayout({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      {list}
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  )
}

export function RecordListPanel({
  title,
  count,
  createLabel,
  onCreate,
  query,
  onQueryChange,
  searchLabel,
  searchPlaceholder,
  children,
  footer,
}: {
  title: string
  count: number
  createLabel: string
  onCreate: () => void
  query: string
  onQueryChange: (value: string) => void
  searchLabel: string
  searchPlaceholder: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs xl:sticky xl:top-4">
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-2 pl-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {title}
            <CountBadge value={count} />
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={onCreate}>
            <Plus aria-hidden /> {createLabel}
          </Button>
        </div>
        <label className="relative block">
          <span className="sr-only">{searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <FieldInput
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </label>
      </div>
      <ul className="max-h-[min(68vh,44rem)] space-y-0.5 overflow-y-auto p-1.5">{children}</ul>
      {footer ? <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">{footer}</div> : null}
    </aside>
  )
}

export function RecordListItem({
  selected,
  onSelect,
  title,
  subtitle,
  leading,
  trailing,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50',
        )}
      >
        {selected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-foreground" aria-hidden /> : null}
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
        </span>
        {trailing ? <span className="flex shrink-0 flex-col items-end gap-1">{trailing}</span> : null}
      </button>
    </li>
  )
}

export function RecordListEmpty({ title, description }: { title: string; description: string }) {
  return (
    <li className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </li>
  )
}

/** Sticky record header carrying identity, save state and the single save action. */
export function EditorHeader({
  title,
  isNew,
  dirty,
  saving,
  savedAt,
  saveLabel,
  onSave,
  meta,
}: {
  title: string
  isNew: boolean
  dirty: boolean
  saving: boolean
  savedAt: string | null
  saveLabel: string
  onSave: () => void
  meta?: ReactNode
}) {
  const state = saving
    ? { label: 'Saving…', dot: 'bg-sky-500 animate-pulse' }
    : dirty
      ? { label: 'Unsaved changes', dot: 'bg-amber-500' }
      : savedAt
        ? { label: `Saved ${savedAt}`, dot: 'bg-emerald-500' }
        : isNew
          ? { label: 'Draft — not saved yet', dot: 'bg-muted-foreground/50' }
          : { label: 'Up to date', dot: 'bg-muted-foreground/40' }

  return (
    <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {isNew ? 'New record' : 'Editing'}
        </p>
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className={cn('size-1.5 rounded-full', state.dot)} aria-hidden />
          {state.label}
        </span>
        <Button type="button" onClick={onSave} disabled={saving}>
          <Save aria-hidden />
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </div>
  )
}

export function EditorError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Notice tone="danger" title="Not saved">
      {message}
    </Notice>
  )
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-background px-3.5 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-pretty text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  )
}

export function ToggleChip({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        checked
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {checked ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  )
}
