/** String helpers for the platform date/time fields; values match the native inputs they replace. */

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar day as "yyyy-MM-dd". */
export function dateKey(day: Date) {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** "yyyy-MM-dd" to a local Date at midnight, or null when it is not a real calendar day. */
export function parseDateKey(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** "Nov 4, 2026" for a "yyyy-MM-dd" key; "" when invalid. */
export function formatDateKey(value: string) {
  const date = parseDateKey(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "";
}

/** "7:30 AM" for "07:30"; the input unchanged when it is not HH:mm. */
export function formatClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

/** Every `step` minutes of the day as HH:mm options, keeping an off-step current value. */
export function timeOptions(step: number, current?: string | null) {
  const minutes = Math.max(1, Math.min(60, Math.round(step)));
  const values: string[] = [];
  for (let at = 0; at < 24 * 60; at += minutes) values.push(`${pad(Math.floor(at / 60))}:${pad(at % 60)}`);
  if (current && /^\d{2}:\d{2}$/.test(current) && !values.includes(current)) {
    values.push(current);
    values.sort();
  }
  return values.map((value) => ({ value, label: formatClock(value) }));
}

/** "yyyy-MM-ddTHH:mm" into its halves; missing parts come back empty. */
export function splitLocalDateTime(value: string | null | undefined) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value || "");
  return { date: match?.[1] ?? "", time: match?.[2] ?? "" };
}
