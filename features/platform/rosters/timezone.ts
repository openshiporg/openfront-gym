import { resolveGymTimeZone } from "../../../lib/timezone";

function rosterDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rosterTimeZone(value?: string | null) {
  return resolveGymTimeZone(value);
}

export function formatRosterOccurrenceDateTime(
  value?: string | null,
  timeZone?: string | null,
) {
  const date = rosterDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: rosterTimeZone(timeZone),
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatRosterAuditDateTime(
  value?: string | null,
  timeZone?: string | null,
) {
  const date = rosterDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: rosterTimeZone(timeZone),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Stable YYYY-MM-DD key for the gym-local calendar day of an occurrence. */
export function rosterDayKey(value?: string | null, timeZone?: string | null) {
  const date = rosterDate(value);
  if (!date) return "unscheduled";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: rosterTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Today", "Tomorrow", or "Saturday, Oct 12" in the gym's time zone. */
export function formatRosterDayHeading(
  value: string | null | undefined,
  timeZone: string | null | undefined,
  now: number,
) {
  const date = rosterDate(value);
  if (!date) return "Unscheduled";
  const key = rosterDayKey(value, timeZone);
  if (key === rosterDayKey(new Date(now).toISOString(), timeZone)) return "Today";
  if (key === rosterDayKey(new Date(now + 86_400_000).toISOString(), timeZone)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: rosterTimeZone(timeZone),
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatRosterTime(value?: string | null, timeZone?: string | null) {
  const date = rosterDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: rosterTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
