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
