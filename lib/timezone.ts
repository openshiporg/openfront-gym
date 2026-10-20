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

export class NonexistentLocalTimeError extends Error {}

/**
 * Exact conversion for a wall-clock time someone chose. Calendar components must be real, a time
 * skipped by a daylight-saving change is rejected, and a time that happens twice resolves to its
 * first (earlier) instant. Round-trips every candidate through the zone instead of trusting offsets.
 */
export function exactLocalTimeToUtc(parts: Omit<LocalDateParts, "second"> & { second?: number }, timeZone: string) {
  const zone = normalizeTimeZone(timeZone);
  const second = parts.second ?? 0;
  const integers = [parts.year, parts.month, parts.day, parts.hour, parts.minute, second];
  if (!integers.every(Number.isInteger) || parts.month < 1 || parts.month > 12 || parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59 || second < 0 || second > 59) {
    throw new NonexistentLocalTimeError("Choose a valid date and time");
  }
  const localEpoch = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  const calendar = new Date(localEpoch);
  if (calendar.getUTCFullYear() !== parts.year || calendar.getUTCMonth() !== parts.month - 1 || calendar.getUTCDate() !== parts.day) {
    throw new NonexistentLocalTimeError("Choose a valid date and time");
  }
  // Offsets either side of the requested wall time cover both sides of any transition that day.
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => timeZoneOffsetMilliseconds(new Date(localEpoch + hours * 3_600_000), zone)));
  const matches = [...offsets]
    .map((offset) => new Date(localEpoch - offset))
    .filter((candidate) => {
      const round = localDateParts(candidate, zone);
      return round.year === parts.year && round.month === parts.month && round.day === parts.day && round.hour === parts.hour && round.minute === parts.minute && round.second === second;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (!matches.length) throw new NonexistentLocalTimeError(`That time does not exist in ${zone} because of a daylight-saving change. Choose another time.`);
  return matches[0];
}

/**
 * The first instant of a local calendar date ("YYYY-MM-DD") in the zone: local midnight, or the
 * first minute that exists when a daylight-saving change skips midnight. A date's end is the
 * start of the next local date, never a fixed 24 hours (days run 23, 24 or 25 hours).
 */
export function localDateStart(dateKey: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) throw new NonexistentLocalTimeError("Choose a valid date");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
    try {
      return exactLocalTimeToUtc({ year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone);
    } catch (error) {
      if (!(error instanceof NonexistentLocalTimeError) || minutes === 0 && /valid date and time/.test(error.message)) throw new NonexistentLocalTimeError("Choose a valid date");
    }
  }
  throw new NonexistentLocalTimeError("Choose a valid date");
}

/** The local calendar date after `dateKey` ("YYYY-MM-DD"). */
export function nextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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

/** The wall time `dayOffset` local days from now; null when a daylight-saving change skips it. */
export function futureLocalOccurrence(
  now: Date,
  timeZone: string,
  dayOffset: number,
  hour: number,
  minute: number,
) {
  const local = localDateParts(now, timeZone);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  try {
    return exactLocalTimeToUtc({
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour,
      minute,
      second: 0,
    }, timeZone);
  } catch (error) {
    if (error instanceof NonexistentLocalTimeError) return null;
    throw error;
  }
}
