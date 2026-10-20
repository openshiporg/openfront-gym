/** Pure formatting helpers for published gym content. They never invent values. */

type DocumentNode = { text?: string; children?: DocumentNode[] };

/** Plain text from a Keystone document field or string. */
export function documentText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object") return "";
  const nodes = (value as { document?: DocumentNode[] }).document;
  if (!Array.isArray(nodes)) return "";
  const collect = (node: DocumentNode): string =>
    typeof node.text === "string" ? node.text : (node.children || []).map(collect).join("");
  return nodes.map(collect).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** "boxing_gloves" → "Boxing gloves"; leaves already-written labels alone. */
export function humanizeLabel(value: string) {
  const text = value.trim();
  if (!/[_-]/.test(text) && /[A-Z\s]/.test(text)) return text;
  const spaced = text.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const DIFFICULTY: Record<string, { label: string; level: number }> = {
  beginner: { label: "Beginner", level: 1 },
  intermediate: { label: "Intermediate", level: 2 },
  advanced: { label: "Advanced", level: 3 },
  "all-levels": { label: "All levels", level: 0 },
};

export function difficultyLabel(value?: string | null) {
  if (!value) return null;
  return DIFFICULTY[value]?.label ?? humanizeLabel(value);
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function weekdayIndex(day: string) {
  const key = day.trim().toLowerCase();
  return WEEKDAYS.findIndex((name) => name === key || name.slice(0, 3) === key.slice(0, 3));
}

/** Published hours in calendar order (Monday first). Unknown keys keep their published order at the end. */
export function orderedHours(entries: Array<[string, string]>) {
  return [...entries].sort((a, b) => {
    const ai = weekdayIndex(a[0]);
    const bi = weekdayIndex(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

/** Weekday key ("monday") for an instant in the club timezone. */
export function clubWeekday(timeZone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now).toLowerCase();
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now).toLowerCase();
  }
}

export function isClubToday(day: string, timeZone: string) {
  return weekdayIndex(day) >= 0 && weekdayIndex(day) === weekdayIndex(clubWeekday(timeZone));
}

/** Weekday / day-of-month / month parts of an instant in the club timezone, for date tiles. */
export function clubDateParts(instant: string | null | undefined, timeZone: string) {
  const date = instant ? new Date(instant) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const format = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
    }
  };
  return { weekday: format({ weekday: "short" }), day: format({ day: "numeric" }), month: format({ month: "short" }) };
}

export function initials(name?: string | null) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "—";
}

export function firstName(name?: string | null, fallback = "there") {
  return name?.trim().split(/\s+/)[0] || fallback;
}

/** Published minimum term in months; zero means no minimum. */
export function termLabel(months?: number | null) {
  return typeof months === "number" && months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : "None";
}

/** Two-digit index for editorial numbering of published lists. */
export function indexLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}
