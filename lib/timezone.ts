export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function normalizeTimeZone(value: unknown, fallback = "UTC") {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    throw new Error("timezone must be a valid IANA time-zone name");
  }
}

export function resolveGymTimeZone(
  gymSettingsTimeZone?: string | null,
  organizationTimeZone?: string | null,
) {
  return normalizeTimeZone(gymSettingsTimeZone || organizationTimeZone || "UTC");
}

export function localDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = localDateParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function localTimeToUtc(parts: Omit<LocalDateParts, "second"> & { second?: number }, timeZone: string) {
  const localEpoch = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  let candidate = new Date(localEpoch);
  candidate = new Date(localEpoch - timeZoneOffsetMilliseconds(candidate, timeZone));
  // Re-evaluate around DST boundaries after the first offset approximation.
  candidate = new Date(localEpoch - timeZoneOffsetMilliseconds(candidate, timeZone));
  return candidate;
}

export function zonedStartOfDay(date: Date, timeZone: string) {
  const local = localDateParts(date, timeZone);
  return localTimeToUtc({ ...local, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function zonedStartOfNextDay(date: Date, timeZone: string) {
  const local = localDateParts(date, timeZone);
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return localTimeToUtc({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  }, timeZone);
}

export function zonedStartOfMonth(date: Date, timeZone: string) {
  const local = localDateParts(date, timeZone);
  return localTimeToUtc({ year: local.year, month: local.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function localWeekdayAtOffset(now: Date, timeZone: string, dayOffset: number) {
  const local = localDateParts(now, timeZone);
  return new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset)).getUTCDay();
}

export function futureLocalOccurrence(
  now: Date,
  timeZone: string,
  dayOffset: number,
  hour: number,
  minute: number,
) {
  const local = localDateParts(now, timeZone);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  return localTimeToUtc({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate(),
    hour,
    minute,
    second: 0,
  }, timeZone);
}
