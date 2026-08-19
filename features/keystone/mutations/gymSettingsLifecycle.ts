import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Context } from ".keystone/types";
import { getTenantId } from "../access/tenantPolicy";
import { normalizeTimeZone } from "../../../lib/timezone";
import { sanitizeGymLogoSvg } from "../utils/gymLogo";
import { normalizeStorefrontHue } from "../../platform/store-settings/lib/storefront-branding";

const STRING_LIMITS = {
  name: 200,
  tagline: 300,
  description: 2_000,
  address: 500,
  phone: 50,
  email: 320,
  locale: 20,
  timezone: 100,
  heroEyebrow: 200,
  heroHeadline: 1_000,
  heroSubheadline: 2_000,
  heroImageUrl: 500,
  heroPrimaryCtaLabel: 100,
  heroPrimaryCtaHref: 500,
  heroSecondaryCtaLabel: 100,
  heroSecondaryCtaHref: 500,
  promoBanner: 500,
  footerTagline: 500,
  copyrightName: 200,
  facilityHeadline: 300,
  facilityDescription: 2_000,
} as const;
const JSON_FIELDS = ["hours", "facilityHighlights", "heroStats", "contactTopics"] as const;
const INTERNAL_HREF_FIELDS = ["heroPrimaryCtaHref", "heroSecondaryCtaHref"] as const;
const MAX_JSON_LENGTH = 20_000;

export function normalizeOnboardingMediaPath(value: unknown): string {
  if (typeof value !== "string") throw new Error("Media must use a local /images path");
  const path = value.trim();
  if (!path) return "";
  if (
    !path.startsWith("/images/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\\")
  ) {
    throw new Error("Media must use a local /images path without traversal or URL parameters");
  }
  if (!existsSync(join(process.cwd(), "public", path.slice(1)))) {
    throw new Error("Media must reference an existing local /images asset");
  }
  return path;
}

function normalizeInternalHref(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} must be an internal path`);
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.includes("..")) {
    throw new Error(`${field} must be an internal path`);
  }
  return href;
}

function normalizeJson(value: unknown, field: string) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length > MAX_JSON_LENGTH) {
    throw new Error(`${field} is too large or invalid`);
  }
  return JSON.parse(serialized);
}

export function normalizeGymSettingsInput(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    if (!(field in input) || input[field] == null) continue;
    if (typeof input[field] !== "string") throw new Error(`${field} must be a string`);
    const value = input[field].trim();
    if (field === "name" && !value) throw new Error("name is required");
    if (value.length > limit) throw new Error(`${field} is too long`);
    output[field] = value;
  }

  if ("timezone" in input && input.timezone != null) {
    output.timezone = normalizeTimeZone(input.timezone);
  }
  if ("currencyCode" in input && input.currencyCode != null) {
    const value = String(input.currencyCode).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) throw new Error("currencyCode must be a three-letter code");
    output.currencyCode = value;
  }
  if ("countryCode" in input && input.countryCode != null) {
    const value = String(input.countryCode).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) throw new Error("countryCode must be a two-letter code");
    output.countryCode = value;
  }
  if ("heroImageUrl" in input && input.heroImageUrl != null) {
    output.heroImageUrl = normalizeOnboardingMediaPath(input.heroImageUrl);
  }
  if ("logoIcon" in input && input.logoIcon != null) {
    if (typeof input.logoIcon !== "string") throw new Error("logoIcon must be a string");
    const submitted = input.logoIcon.trim();
    const sanitized = sanitizeGymLogoSvg(submitted);
    if (submitted && !sanitized) throw new Error("logoIcon must be a valid, safe SVG document");
    output.logoIcon = sanitized;
  }
  if ("brandHue" in input && input.brandHue != null) {
    output.brandHue = normalizeStorefrontHue(input.brandHue);
  }
  for (const field of INTERNAL_HREF_FIELDS) {
    if (field in input && input[field] != null) output[field] = normalizeInternalHref(input[field], field);
  }
  for (const field of JSON_FIELDS) {
    if (!(field in input) || input[field] == null) continue;
    if (field === "hours") {
      if (typeof input[field] !== "object" || Array.isArray(input[field])) {
        throw new Error("hours must be an object");
      }
    } else if (!Array.isArray(input[field])) {
      throw new Error(`${field} must be an array`);
    }
    output[field] = normalizeJson(input[field], field);
  }
  if ("rating" in input) {
    const value = input.rating;
    if (value == null || value === "") output.rating = null;
    else {
      const rating = Number(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw new Error("rating must be between 0 and 5");
      output.rating = rating.toFixed(1);
    }
  }
  if ("reviewCount" in input && input.reviewCount != null) {
    const count = Number(input.reviewCount);
    if (!Number.isInteger(count) || count < 0 || count > 1_000_000) {
      throw new Error("reviewCount must be a non-negative integer");
    }
    output.reviewCount = count;
  }
  return output;
}

export async function upsertGymSettings(
  root: unknown,
  { data }: { data: Record<string, unknown> },
  context: Context
) {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (
    !session?.itemId ||
    !organizationId ||
    !(session.data?.role?.canManageOnboarding || session.data?.role?.canManageSettings)
  ) {
    throw new Error("Gym settings management permission required");
  }
  const normalized = normalizeGymSettingsInput(data);
  const existing = await context.sudo().query.GymSettings.findMany({
    where: { organization: { id: { equals: organizationId } } },
    take: 2,
    orderBy: [{ createdAt: "asc" }],
    query: "id",
  });
  if (existing.length > 1) throw new Error("Gym settings singleton invariant is violated");
  if (!existing[0] && (!normalized.name || !normalized.heroImageUrl)) {
    throw new Error("Initial gym settings require a business name and canonical hero image");
  }
  if (existing[0]) {
    return context.sudo().db.GymSettings.updateOne({
      where: { id: existing[0].id },
      data: normalized,
    });
  }
  return context.sudo().db.GymSettings.createOne({
    data: {
      ...normalized,
      organization: { connect: { id: organizationId } },
    },
  });
}
