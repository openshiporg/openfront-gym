import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Context } from ".keystone/types";
import { getTenantId } from "../access/tenantPolicy";
import { normalizeTimeZone } from "../../../lib/timezone";
import { sanitizeGymLogoSvg } from "../utils/gymLogo";
import { isGymLogoColor, normalizeGymLogoColor, normalizeStorefrontHue } from "../lib/storefront-branding";
import { PARTICIPATION_TERMS_MAX_LENGTH, participationPolicyForEditor, publishParticipationTerms } from "../lib/participation-terms";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockParticipationPolicy } from "../lib/operational-policy";
import { lockTransactionKey } from "./classCapacity";
import { publicCtaHref, validateContactTopics, validateFacilityHighlights, validateHeroStats, validateWeeklyHours } from "../lib/gym-settings-content";

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
const CTA_PAIRS = [["heroPrimaryCtaLabel", "heroPrimaryCtaHref", "Primary button"], ["heroSecondaryCtaLabel", "heroSecondaryCtaHref", "Secondary button"]] as const;

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

/** A homepage button destination: empty means "use the default button"; otherwise a public storefront page. */
function normalizeCtaHref(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) return "";
  const href = publicCtaHref(value);
  if (!href) throw new Error(`${label} link must open a public storefront page such as /join, /schedule or /contact`);
  return href;
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
    if (value !== "USD") throw new Error("Gym billing, retail and training currently support USD only");
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
  if ("logoColor" in input && input.logoColor != null) {
    if (!isGymLogoColor(input.logoColor)) throw new Error("logoColor must be a hue rotation in degrees");
    output.logoColor = normalizeGymLogoColor(input.logoColor);
  }
  if ("brandHue" in input && input.brandHue != null) {
    output.brandHue = normalizeStorefrontHue(input.brandHue);
  }
  for (const [labelField, hrefField, label] of CTA_PAIRS) {
    if (hrefField in input && input[hrefField] != null) output[hrefField] = normalizeCtaHref(input[hrefField], label);
  }
  if ("hours" in input && input.hours != null) output.hours = validateWeeklyHours(input.hours);
  if ("contactTopics" in input && input.contactTopics != null) output.contactTopics = validateContactTopics(input.contactTopics);
  if ("facilityHighlights" in input && input.facilityHighlights != null) output.facilityHighlights = validateFacilityHighlights(input.facilityHighlights);
  if ("heroStats" in input && input.heroStats != null) output.heroStats = validateHeroStats(input.heroStats);
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

function settingsActor(context: Context) {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId || !(session.data?.role?.canManageOnboarding || session.data?.role?.canManageSettings)) {
    throw new Error("Store Settings management permission required");
  }
  return { userId: session.itemId as string, organizationId: organizationId as string };
}

const EDITABLE_FIELDS = [
  "id", "name", "tagline", "logoIcon", "logoColor", "description", "address", "phone", "email", "currencyCode", "locale", "timezone", "countryCode",
  "hours", "heroEyebrow", "heroHeadline", "heroSubheadline", "heroImageUrl", "heroPrimaryCtaLabel", "heroPrimaryCtaHref", "heroSecondaryCtaLabel",
  "heroSecondaryCtaHref", "promoBanner", "footerTagline", "copyrightName", "facilityHeadline", "facilityDescription", "facilityHighlights", "heroStats",
  "contactTopics", "updatedAt",
] as const;

/**
 * The signed-in operator's own tenant settings exactly as stored (not the public storefront
 * projection of whichever organization the storefront serves), plus the current policy.
 */
export async function gymSettingsEditor(_root: unknown, _args: unknown, context: Context) {
  const actor = settingsActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const [settings, policy] = await Promise.all([
    prisma.gymSettings.findFirst({ where: { organizationId: actor.organizationId }, orderBy: [{ createdAt: "asc" }], select: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, true])) }),
    participationPolicyForEditor(prisma, actor.organizationId),
  ]);
  return {
    settings: settings ? { ...settings, updatedAt: settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt } : null,
    participationPolicy: policy,
  };
}

export async function upsertGymSettings(
  root: unknown,
  { data, expectedUpdatedAt }: { data: Record<string, unknown>; expectedUpdatedAt?: string | null },
  context: Context
) {
  const actor = settingsActor(context);
  if (data && "participationTerms" in data) throw new Error("Participation terms are published separately; use Publish terms");
  const normalized = normalizeGymSettingsInput(data || {});
  for (const [labelField, hrefField, label] of CTA_PAIRS) {
    const labelValue = labelField in normalized ? normalized[labelField] : undefined;
    const hrefValue = hrefField in normalized ? normalized[hrefField] : undefined;
    if ((labelValue === undefined) !== (hrefValue === undefined)) throw new Error(`${label} needs its label and link saved together`);
    if (labelValue !== undefined && Boolean(labelValue) !== Boolean(hrefValue)) throw new Error(`${label} needs both a label and a link, or neither for the default button`);
  }
  const saved = await (context as any).transaction(async (transactionContext: any) => {
    const tx = guardKeystonePrismaResults(transactionContext.prisma);
    await lockTransactionKey(tx, `gym-settings:${actor.organizationId}`);
    const existing = await tx.gymSettings.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ createdAt: "asc" }], take: 2, select: { id: true, updatedAt: true } });
    if (existing.length > 1) throw new Error("Store Settings singleton invariant is violated");
    if (existing[0] && expectedUpdatedAt && new Date(String(expectedUpdatedAt)).getTime() !== new Date(existing[0].updatedAt).getTime()) {
      throw new Error("Settings changed since you opened this page. Reload to see the latest values, then save your change again.");
    }
    if (!existing[0] && (!normalized.name || !normalized.heroImageUrl)) {
      throw new Error("Initial gym settings require a business name and canonical hero image");
    }
    return existing[0]
      ? transactionContext.sudo().db.GymSettings.updateOne({ where: { id: existing[0].id }, data: normalized })
      : transactionContext.sudo().db.GymSettings.createOne({ data: { ...normalized, organization: { connect: { id: actor.organizationId } } } });
  });
  return saved;
}

/**
 * Deliberate publication of pasted participation terms. The policy lock is taken first and the
 * current policy re-read inside it: if someone published since the editor loaded, the save is
 * refused instead of silently replacing their version. Settings text and the published
 * version commit together.
 */
export async function publishGymParticipationTerms(
  _root: unknown,
  { text, expectedPolicyId }: { text: string; expectedPolicyId?: string | null },
  context: Context,
) {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  if (typeof text !== "string") throw new Error("Participation terms must be text");
  const body = text.trim();
  if (body.length > PARTICIPATION_TERMS_MAX_LENGTH) throw new Error(`Participation terms must be ${PARTICIPATION_TERMS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer`);
  // Publishing or clearing legal terms is the same authority as the operations policy.publish
  // command, re-read from the current role under the policy lock; Store Settings or onboarding
  // access alone does not grant it.
  return publishTermsForOrganization(context, organizationId, String(session.itemId), body, expectedPolicyId ?? null, { requirePolicyAuthority: true });
}

/** The current policy-publication authority: same tenant, current role, all-record operations. */
export async function assertCurrentPolicyPublisher(tx: any, userId: string, organizationId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { organizationId: true, role: { select: { organizationId: true, canManageAllRecords: true, canAccessDashboard: true } } } });
  if (!user || user.organizationId !== organizationId || user.role?.organizationId !== organizationId || !user.role?.canAccessDashboard || !user.role?.canManageAllRecords) {
    throw new Error("Publishing participation terms needs operations manager access");
  }
}

/** Shared by Store Settings and onboarding; `expectedPolicyId` null means "no policy expected". */
export async function publishTermsForOrganization(context: Context, organizationId: string, userId: string, body: string, expectedPolicyId: string | null | undefined, options: { requirePolicyAuthority?: boolean } = {}) {
  return (context as any).transaction(async (transactionContext: any) => {
    const tx = guardKeystonePrismaResults(transactionContext.prisma);
    await lockParticipationPolicy(tx, organizationId);
    if (options.requirePolicyAuthority) await assertCurrentPolicyPublisher(tx, userId, organizationId);
    const current = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (expectedPolicyId !== undefined && (current?.id ?? null) !== expectedPolicyId) {
      throw new Error("The participation policy changed since you opened this page. Reload, review the current version, then publish again.");
    }
    const settings = await tx.gymSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { id: true } });
    if (settings) await tx.gymSettings.update({ where: { id: settings.id }, data: { participationTerms: body } });
    const policy = await publishParticipationTerms(tx, organizationId, body, userId);
    return participationPolicyForEditor(tx, organizationId).then((editor) => editor ?? (policy ? { policyId: policy.id } : null));
  });
}
