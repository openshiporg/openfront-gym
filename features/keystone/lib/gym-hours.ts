/**
 * Gym Settings weekly hours: one reader for the settings editor's structured shape
 * (`{ enabled, ranges: [{ open: "05:00", close: "22:00" }] }`) and legacy text
 * (`"5:00 AM - 10:00 PM"`, `"Closed"`, `"24/7"`). Public pages and admission both use it.
 */
export type HoursRange = { start: number; end: number };
export type DayHours = "closed" | "all" | HoursRange[];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Minutes after midnight for `HH:mm` (24-hour) or `h[:mm] am|pm`. */
export function parseClockMinute(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) throw new Error("Hours need a supported time");
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) throw new Error("Hours have an invalid clock hour");
    hour = hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23 || !match[2]) throw new Error("Use HH:mm for 24-hour times");
  return hour * 60 + Number(match[2] || 0);
}

function range(open: string, close: string): HoursRange {
  const start = parseClockMinute(open);
  const end = parseClockMinute(close);
  if (start === end) throw new Error("Equal opening and closing times are ambiguous");
  return { start, end };
}

/** A day's hours, or null when the value is missing or unusable. */
export function parseDayHours(value: unknown): DayHours | null {
  try {
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (!text) return null;
      if (text === "closed") return "closed";
      if (text === "24/7" || text === "24 hours" || text === "open 24 hours") return "all";
      return text.split(/\s*[,;]\s*/).filter(Boolean).map((part) => {
        const [open, close, extra] = part.split(/\s*[-–—]\s*/);
        if (!open || !close || extra !== undefined) throw new Error("Hours need one opening and closing time");
        return range(open, close);
      });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const day = value as { enabled?: unknown; allDay?: unknown; ranges?: unknown };
      if (day.enabled === false) return "closed";
      if (day.allDay === true) return "all";
      if (!Array.isArray(day.ranges) || !day.ranges.length) return null;
      const ranges = day.ranges.map((entry: any) => {
        if (typeof entry?.open !== "string" || typeof entry?.close !== "string") throw new Error("Hours need opening and closing times");
        return range(entry.open, entry.close);
      });
      // Earlier onboarding wrote 24-hour days as 00:00–23:59; that day is open all day.
      if (ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === 23 * 60 + 59) return "all";
      return ranges;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatClockMinute(minute: number) {
  const hour = Math.floor(minute / 60) % 24;
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatDayHours(day: DayHours) {
  if (day === "closed") return "Closed";
  if (day === "all") return "Open 24 hours";
  return day.map((entry) => `${formatClockMinute(entry.start)} – ${formatClockMinute(entry.end)}`).join(", ");
}

const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * The Store Settings editor's shape (`{ enabled, allDay?, ranges: [{ open, close }] }`) for every
 * readable day, so onboarding and the editor persist identical hours. Open-all-day is explicit
 * (never a 00:00–23:59 range that would close for the last minute). Unreadable values are kept.
 */
export function editorWeeklyHours(hours: unknown): Record<string, unknown> {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return {};
  return Object.fromEntries(Object.entries(hours as Record<string, unknown>).map(([day, value]) => {
    const parsed = parseDayHours(value);
    if (parsed === "closed") return [day, { enabled: false, ranges: [] }];
    if (parsed === "all") return [day, { enabled: true, allDay: true, ranges: [] }];
    if (parsed) return [day, { enabled: true, ranges: parsed.map((entry) => ({ open: clock(entry.start), close: clock(entry.end) })) }];
    return [day, value];
  }));
}

/** [day, display text] for each day with published hours; unreadable legacy text is shown as written. */
export function displayWeeklyHours(hours: unknown): Array<[string, string]> {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return [];
  return Object.entries(hours as Record<string, unknown>).flatMap(([day, value]): Array<[string, string]> => {
    const parsed = parseDayHours(value);
    if (parsed) return [[day, formatDayHours(parsed)]];
    return typeof value === "string" && value.trim() ? [[day, value.trim()]] : [];
  });
}

/**
 * Whether the facility is open at `minute` on `day` (lowercase weekday). An overnight
 * range belongs to its opening day, so early morning is covered by yesterday's range.
 */
export function isOpenAt(hours: unknown, day: string, minute: number) {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) throw new Error("Facility operating hours are not configured; staff review is required");
  const daily = Object.fromEntries(Object.entries(hours as Record<string, unknown>).map(([key, value]) => [key.toLowerCase(), value]));
  const today = parseDayHours(daily[day]);
  if (!today) throw new Error(`Facility hours for ${day} are not configured; update Store Settings`);
  const previous = parseDayHours(daily[WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7]]);
  const todayOpen = today === "all" || (today !== "closed" && today.some((entry) =>
    entry.start < entry.end ? minute >= entry.start && minute < entry.end : minute >= entry.start));
  const overnightCarry = Array.isArray(previous) && previous.some((entry) => entry.start > entry.end && minute < entry.end);
  return todayOpen || overnightCarry;
}
