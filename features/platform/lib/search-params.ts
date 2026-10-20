/** URL query values may repeat (`?q=a&q=b`); screens read the first value, bounded. */
export type SearchParamValue = string | string[] | undefined | null;

export function firstParam(value: SearchParamValue, max = 200) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim().slice(0, max) : "";
}

export function enumParam<T extends string>(value: SearchParamValue, allowed: readonly T[], fallback: T): T {
  const first = firstParam(value, 60);
  return (allowed as readonly string[]).includes(first) ? (first as T) : fallback;
}

/** A strict calendar date (YYYY-MM-DD) or empty. */
export function dateParam(value: SearchParamValue) {
  const first = firstParam(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return "";
  const [year, month, day] = first.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? first : "";
}

export function pageParam(value: SearchParamValue, max = 10_000) {
  const number = Number(firstParam(value, 12));
  return Number.isSafeInteger(number) ? Math.min(Math.max(0, number), max) : 0;
}
