import { parseDayHours } from "./gym-hours";

/**
 * One bounded schema for published storefront settings. The editor, the save mutation and the
 * public projection all use these limits, so a save never succeeds with content the
 * storefront would silently drop.
 */
export const SETTINGS_LIMITS = {
  contactTopics: { items: 12, title: 100, details: 12, detail: 300 },
  facilityHighlights: { items: 12, title: 200, description: 1_000, features: 20, feature: 100 },
  heroStats: { items: 6, value: 50, label: 100 },
  hoursJson: 10_000,
} as const;

export const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/** Public pages a homepage button may open; dashboard, API and unknown paths are never published. */
const PUBLIC_CTA_PATHS = [
  /^\/$/, /^\/classes$/, /^\/classes\/[A-Za-z0-9_-]{1,64}$/, /^\/schedule$/, /^\/memberships$/, /^\/join$/,
  /^\/instructors$/, /^\/instructors\/[A-Za-z0-9_-]{1,64}$/, /^\/facilities$/, /^\/contact$/, /^\/policies$/,
  /^\/waiver$/, /^\/account$/,
];

/** A safe storefront destination with optional query/anchor, or null when it isn't one. */
export function publicCtaHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.includes("..") || /[\u0000-\u001f\u007f]/.test(href) || href.length > 500) return null;
  let url: URL;
  try { url = new URL(href, "https://storefront.invalid"); } catch { return null; }
  if (url.origin !== "https://storefront.invalid") return null;
  return PUBLIC_CTA_PATHS.some((pattern) => pattern.test(url.pathname)) ? `${url.pathname}${url.search}${url.hash}` : null;
}

function text(value: unknown, field: string, max: number, required = true) {
  if (value == null || value === "") {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return trimmed;
}

function list(value: unknown, field: string, max: number) {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list`);
  if (value.length > max) throw new Error(`${field} allows at most ${max} entries`);
  return value;
}

export function validateContactTopics(value: unknown) {
  const limits = SETTINGS_LIMITS.contactTopics;
  return list(value, "Contact cards", limits.items).map((item: any, index) => {
    const label = `Contact card ${index + 1}`;
    const details = list(item?.details, `${label} details`, limits.details).map((detail, line) => text(detail, `${label} detail ${line + 1}`, limits.detail));
    if (!details.length) throw new Error(`${label} needs at least one detail`);
    return { title: text(item?.title, `${label} title`, limits.title), details };
  });
}

export function validateFacilityHighlights(value: unknown) {
  const limits = SETTINGS_LIMITS.facilityHighlights;
  return list(value, "Facility highlights", limits.items).map((item: any, index) => {
    const label = `Facility highlight ${index + 1}`;
    return {
      title: text(item?.title, `${label} title`, limits.title),
      description: text(item?.description, `${label} description`, limits.description),
      features: list(item?.features ?? [], `${label} features`, limits.features).map((feature, line) => text(feature, `${label} feature ${line + 1}`, limits.feature)),
    };
  });
}

export function validateHeroStats(value: unknown) {
  const limits = SETTINGS_LIMITS.heroStats;
  return list(value, "Hero stats", limits.items).map((item: any, index) => ({
    value: text(item?.value, `Hero stat ${index + 1} value`, limits.value),
    label: text(item?.label, `Hero stat ${index + 1} label`, limits.label),
  }));
}

/**
 * Opening hours are enforced at admission, so every weekday must be readable before saving:
 * closed, open all day, or one or more ranges (overnight allowed).
 */
export function validateWeeklyHours(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Opening hours must list each day of the week");
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const day of WEEKDAY_KEYS) {
    const parsed = parseDayHours(source[day]);
    if (!parsed) throw new Error(`Opening hours for ${day[0].toUpperCase()}${day.slice(1)} are missing or unreadable; set closed, all day, or valid times`);
    output[day] = source[day];
  }
  if (JSON.stringify(output).length > SETTINGS_LIMITS.hoursJson) throw new Error("Opening hours are too long");
  return output;
}
