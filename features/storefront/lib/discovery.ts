/** Pure customer discovery helpers. Availability remains a server decision. */
export function localDateKey(instant: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}
export function calendarDays(now: Date, timeZone: string, count = 14) {
  const first = localDateKey(now, timeZone);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${first}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date),
      short: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date),
      full: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(date),
    };
  });
}
export function discoveryHref(path: string, current: string, changes: Record<string, string | null>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (!value || value === "all") params.delete(key); else params.set(key, value);
  }
  return params.size ? `${path}?${params}` : path;
}
export type DiscoverableSession = { name: string; instructor: string; difficulty?: string; classTypeId?: string; instructorId?: string; spots: number };
export function matchesSession(item: DiscoverableSession, filters: { q?: string; coach?: string; format?: string; availability?: string }) {
  const terms = (filters.q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${item.name} ${item.instructor} ${item.difficulty || ""}`.toLowerCase();
  return terms.every(term => text.includes(term)) && (!filters.coach || item.instructorId === filters.coach) && (!filters.format || item.classTypeId === filters.format) && (filters.availability !== "open" || item.spots > 0);
}
export function chronologicalBookings<T extends { classInstance?: { date?: string | null } | null }>(bookings: T[]) {
  return [...bookings].sort((a, b) => (a.classInstance?.date || "9999").localeCompare(b.classInstance?.date || "9999"));
}
export function creditLabel(value: number | null | undefined) {
  return value === -1 ? "Unlimited classes" : value === 0 ? "No classes included" : typeof value === "number" ? `${value} classes each service month` : "Class allowance not available";
}
