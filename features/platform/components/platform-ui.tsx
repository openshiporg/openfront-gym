/**
 * Shared presentation primitives for the gym platform pages.
 *
 * Server-safe (no hooks, no client directive) so server screens and client
 * workspaces render the same page header, KPI band, panels, notices, empty
 * states, status pills, form fields and pagination.
 */
import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "positive" | "warning" | "danger" | "info";

const toneDot: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
};

const pillTone: Record<Tone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300",
};

// The shared Alert carries feedback; tone only colors its icon (danger uses the destructive variant).
const noticeAccent: Record<Tone, string> = {
  neutral: "",
  positive: "[&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
  warning: "border-amber-300/70 dark:border-amber-900/70 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
  danger: "",
  info: "[&>svg]:text-sky-600 dark:[&>svg]:text-sky-400",
};

const noticeIcon: Record<Tone, LucideIcon> = {
  neutral: Info,
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** "past_due" → "Past due"; leaves already-readable labels intact. */
export function humanize(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initialsOf(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""}`.toUpperCase();
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

/**
 * The canonical platform page heading (title, description, page actions). `eyebrow` is accepted
 * for existing call sites but not rendered: canonical pages carry one title.
 */
export function PlatformHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}

export function PlatformBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("w-full min-w-0 space-y-6 px-4 pb-12 md:px-6", className)}>{children}</div>;
}

/** Two-column workspace: wide main column plus a supporting rail on xl screens. */
export function SplitLayout({
  main,
  aside,
  className,
  asideWidth = "wide",
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
  className?: string;
  asideWidth?: "narrow" | "wide";
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 items-start gap-6",
        asideWidth === "narrow"
          ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
          : "xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]",
        className,
      )}
    >
      <div className="min-w-0 space-y-6">{main}</div>
      <div className="min-w-0 space-y-6">{aside}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export function Panel({
  id,
  tone,
  className,
  children,
}: {
  id?: string;
  tone?: "warning" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 scroll-mt-6 overflow-hidden rounded-lg border bg-background text-foreground",
        tone === "danger" && "border-rose-300/80 dark:border-rose-900/70",
        tone === "warning" && "border-amber-300/80 dark:border-amber-900/70",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  count,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <span className="min-w-0">{title}</span>
          {typeof count === "number" ? <CountBadge value={count} /> : null}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-pretty text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-4 sm:p-5", className)}>{children}</div>;
}

export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CountBadge({ value, tone = "neutral" }: { value: number; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[11px] font-medium tabular-nums leading-none",
        pillTone[tone],
      )}
    >
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const Icon = noticeIcon[tone];
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(noticeAccent[tone], className)}
    >
      <Icon className="size-4" aria-hidden />
      {title ? <AlertTitle className="leading-5">{title}</AlertTitle> : null}
      {children || action ? (
        <AlertDescription className="text-pretty">
          {children}
          {action ? <div className={children ? "mt-3" : undefined}>{action}</div> : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
  className,
  dot = true,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none",
        pillTone[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function EmptyBlock({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  // The shared EmptyState renders the state; page-specific actions (links, forms) follow it.
  return (
    <div className={cn("w-full", className)}>
      <EmptyState
        title={typeof title === "string" ? title : String(title ?? "")}
        description={typeof description === "string" ? description : ""}
        icons={Icon ? [Icon] : []}
        className={compact ? "p-8" : undefined}
      />
      {description && typeof description !== "string" ? (
        <div className={cn("-mt-1 px-6 text-center text-sm text-muted-foreground", compact ? "pb-8" : "pb-14")}>{description}</div>
      ) : null}
      {action ? <div className={cn("flex justify-center px-6", compact ? "-mt-4 pb-8" : "-mt-10 pb-14")}>{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function KeyValueList({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y text-sm", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Initials({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Seats taken for a class session as plain figures; full or overbooked sessions are called out
 * in text so the operator's eye lands on them first.
 */
export function SeatCount({ booked, capacity }: { booked: number; capacity: number }) {
  if (capacity <= 0) return <span className="text-xs text-muted-foreground">Capacity not set</span>;
  const full = booked >= capacity;
  return (
    <span className={cn("text-xs font-medium tabular-nums", full ? "text-rose-700 dark:text-rose-400" : "text-foreground")}>
      {booked}
      <span className="text-muted-foreground">/{capacity}</span>
      {full ? <span className="ml-1.5 font-normal">{booked > capacity ? "Over capacity" : "Full"}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Shared segmented tab track: as wide as its tabs, and never wider than its container.
 * When the tabs overflow, the track fills the container and scrolls inside (no visible
 * scrollbar); SegmentedTrackScroller keeps the selected tab in view. Pair with data-seg-track.
 */
export const segmentedTrackClass =
  "inline-flex w-max max-w-full items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0";

/** In-page anchor navigation for long operational workspaces. */
export function SectionNav({
  items,
  className,
}: {
  items: Array<{ id: string; label: string; count?: number; tone?: Tone }>;
  className?: string;
}) {
  return (
    <nav aria-label="Sections on this page" className={className}>
      <ul data-seg-track className={cn(segmentedTrackClass, "gap-1 rounded-lg border bg-muted/40 p-1")}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
              {typeof item.count === "number" ? <CountBadge value={item.count} tone={item.tone} /> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Segmented control made of links, for URL-driven views and state filters. */
export function SegmentedLinks({
  items,
  label,
  className,
}: {
  items: Array<{ label: string; href: string; active: boolean; count?: number }>;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("max-w-full", className)}>
      <ul data-seg-track className={cn(segmentedTrackClass, "gap-0.5 rounded-lg border bg-muted/50 p-0.5")}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.active
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <span className="tabular-nums text-[11px] text-muted-foreground">{item.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PaginationBar({
  summary,
  pageLabel,
  previousHref,
  nextHref,
  className,
}: {
  summary?: React.ReactNode;
  pageLabel?: React.ReactNode;
  previousHref?: string | null;
  nextHref?: string | null;
  className?: string;
}) {
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <p className="text-xs tabular-nums text-muted-foreground">{summary}</p>
      <div className="flex items-center gap-2">
        {pageLabel ? <span className="mr-1 text-xs tabular-nums text-muted-foreground">{pageLabel}</span> : null}
        {previousHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={previousHref}>
              <ChevronLeft aria-hidden /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden /> Previous
          </Button>
        )}
        {nextHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={nextHref}>
              Next <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export const nativeSelectClassName =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select {...props} className={cn(nativeSelectClassName, className)} />;
}

/** Operator-density text input (the base Input is sized for storefront forms). */
export function FieldInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={cn("h-9 px-3 text-sm", className)} />;
}

export function FieldTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return <Textarea {...props} className={cn("min-h-20 text-sm", className)} />;
}

export function FormField({
  label,
  hint,
  optional,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <label htmlFor={htmlFor} className="grid min-w-0 gap-1.5">
        <span className="text-xs font-medium text-foreground">
          {label}
          {optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
        </span>
        {children}
      </label>
      {hint ? <p className="text-pretty text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Checkbox row; `confirm` styles it as an explicit acknowledgement before a consequential action. */
export function CheckField({
  name,
  value,
  required,
  defaultChecked,
  confirm = false,
  className,
  children,
}: {
  name: string;
  value?: string;
  required?: boolean;
  defaultChecked?: boolean;
  confirm?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 text-xs leading-5",
        confirm
          ? "rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-muted-foreground"
          : "text-foreground",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        required={required}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-foreground"
      />
      <span className="text-pretty">{children}</span>
    </label>
  );
}

export function SearchField({
  name,
  defaultValue,
  placeholder,
  label,
  className,
}: {
  name: string;
  defaultValue?: string;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <FieldInput name={name} type="search" defaultValue={defaultValue} placeholder={placeholder} className="pl-9" />
    </label>
  );
}

/** Collapsible inline form row; keeps consequential forms one click away instead of always expanded. */
export function Disclosure({
  summary,
  children,
  className,
  tone = "neutral",
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <details className={cn("group/disclosure rounded-lg border bg-background", className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
          tone === "danger" ? "text-rose-700 dark:text-rose-400" : "text-foreground",
        )}
      >
        <span className="min-w-0">{summary}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/disclosure:rotate-90" aria-hidden />
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/** Horizontally scrollable data table; rows keep a readable minimum width on phones. */
export function DataTable({
  label,
  minWidth = "40rem",
  className,
  children,
}: {
  label: string;
  minWidth?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-full min-w-0 overflow-x-auto", className)}>
      <table
        aria-label={label}
        className="w-full border-collapse text-sm [&_tbody_tr:last-child>td]:border-b-0"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 whitespace-nowrap border-b bg-muted/40 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b px-3 py-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-muted/30", className)}>{children}</tr>;
}

/** Two-line identity cell (name + secondary line) used across tables. */
export function PersonCell({
  name,
  detail,
  href,
  avatar = false,
}: {
  name?: string | null;
  detail?: React.ReactNode;
  href?: string;
  avatar?: boolean;
}) {
  const label = name || "Unknown member";
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatar ? <Initials name={label} /> : null}
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
            {label}
          </Link>
        ) : (
          <p className="truncate font-medium text-foreground">{label}</p>
        )}
        {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}
