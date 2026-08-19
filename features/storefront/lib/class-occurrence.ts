const DEFAULT_TIME_ZONE = "UTC";

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeTimeZone(value?: string | null) {
  const candidate = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function occurrenceDayIndex(startsAt: string, timeZone?: string | null) {
  const date = validDate(startsAt);
  if (!date) return 0;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

export function formatOccurrenceDate(startsAt: string, timeZone?: string | null) {
  const date = validDate(startsAt);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatOccurrenceShortDate(startsAt: string, timeZone?: string | null) {
  const date = validDate(startsAt);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatOccurrenceTime(startsAt: string, timeZone?: string | null) {
  const date = validDate(startsAt);
  if (!date) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
