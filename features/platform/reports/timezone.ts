import { resolveGymTimeZone } from "../../../lib/timezone";

function reportDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatReportDateTime(
  value?: string | null,
  timeZone?: string | null,
) {
  const date = reportDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveGymTimeZone(timeZone),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatReportDate(
  value?: string | null,
  timeZone?: string | null,
) {
  const date = reportDate(value);
  if (!date) return "No recent check-in";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveGymTimeZone(timeZone),
    month: "short",
    day: "numeric",
  }).format(date);
}
