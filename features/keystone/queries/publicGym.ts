import type { KeystoneContext } from "@keystone-6/core/types";
import { resolveGymTimeZone } from "../../../lib/timezone";
import { sanitizeGymLogoSvg } from "../utils/gymLogo";
import { normalizeGymLogoColor, normalizeStorefrontHue } from "../lib/storefront-branding";
import { publicCtaHref } from "../lib/gym-settings-content";
import { publicQualificationNames } from "../mutations/trainerQualifications";

const DEFAULT_INSTANCE_WINDOW_DAYS = 14;
const MAX_INSTANCE_WINDOW_DAYS = 90;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

export const PUBLIC_GYM_QUERY_NAMES = [
  "publicGymSettings",
  "publicGymClassTypes",
  "publicGymClassType",
  "publicGymSchedules",
  "publicGymSchedule",
  "publicGymClassInstances",
  "publicGymClassInstance",
  "publicGymInstructors",
  "publicGymInstructor",
  "publicGymMembershipTiers",
  "publicGymMembershipTier",
] as const;

export function documentToPlainText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object") return null;

  const document = (value as { document?: Array<{ children?: Array<{ text?: unknown }> }> }).document;
  const text = document
    ?.flatMap((node) => node.children ?? [])
    .map((child) => (typeof child.text === "string" ? child.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

export function normalizePublicLimit(value?: number | null) {
  if (!Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_LIST_LIMIT);
}

/** Bounded continuation offset for public catalog pages. */
export function publicSkip(value?: number | null) {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 5_000) : 0;
}

/**
 * Keyset continuation for public catalogs: rows strictly after the `after` record in the list's
 * (field, id) order, so every published row is reachable however deep, without an offset cap.
 */
async function afterCursor(context: KeystoneContext, listKey: "ClassType" | "Instructor" | "MembershipTier", organizationId: string | null, after: string | null | undefined, field: string | null) {
  if (!after) return {};
  const [anchor] = await (publicContext(context).query as any)[listKey].findMany({
    where: publicTenantWhere(organizationId, { id: { equals: after } }), take: 1, query: field ? `id ${field}` : "id",
  });
  if (!anchor) return { id: { equals: "__no_public_cursor__" } };
  if (!field) return { id: { gt: after } };
  return { OR: [{ [field]: { gt: anchor[field] } }, { AND: [{ [field]: { equals: anchor[field] } }, { id: { gt: after } }] }] };
}

const containsText = (value: string) => ({ contains: value, mode: "insensitive" as const });
const CLASS_LEVELS = ["beginner", "intermediate", "advanced", "all-levels"];

export function resolvePublicInstanceWindow(
  from?: string | null,
  to?: string | null,
  now = new Date()
) {
  const requestedStart = from ? new Date(from) : now;
  if (Number.isNaN(requestedStart.getTime())) throw new Error("Invalid public class start date.");

  const start = new Date(Math.max(requestedStart.getTime(), now.getTime()));
  const maximumEnd = new Date(start.getTime() + MAX_INSTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const requestedEnd = to
    ? new Date(to)
    : new Date(start.getTime() + DEFAULT_INSTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(requestedEnd.getTime())) throw new Error("Invalid public class end date.");
  if (requestedEnd < start) throw new Error("Public class end date must be after the start date.");

  return {
    from: start.toISOString(),
    to: new Date(Math.min(requestedEnd.getTime(), maximumEnd.getTime())).toISOString(),
  };
}

export function normalizePublicMediaPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !path.startsWith("/images/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\\")
  ) {
    return null;
  }
  return path;
}

function publicText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, limit) : null;
}

/** Legacy rows are re-checked too: only public storefront pages are ever rendered as buttons. */
function publicInternalHref(value: unknown): string | null {
  return publicCtaHref(value);
}

function publicHours(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 10_000) return null;
  return JSON.parse(serialized) as Record<string, unknown>;
}

function publicHeroStats(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const valueText = publicText((item as any).value, 50);
    const label = publicText((item as any).label, 100);
    return valueText && label ? [{ value: valueText, label }] : [];
  });
}

function publicContactTopics(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = publicText((item as any).title, 100);
    const details = Array.isArray((item as any).details)
      ? (item as any).details.slice(0, 12).flatMap((detail: unknown) => {
          const text = publicText(detail, 300);
          return text ? [text] : [];
        })
      : [];
    return title && details.length ? [{ title, details }] : [];
  });
}

function publicFacilityHighlights(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = publicText((item as any).title, 200);
    const description = publicText((item as any).description, 1_000);
    const features = Array.isArray((item as any).features)
      ? (item as any).features.slice(0, 20).flatMap((feature: unknown) => {
          const text = publicText(feature, 100);
          return text ? [text] : [];
        })
      : [];
    return title && description ? [{ title, description, features }] : [];
  });
}

/** Re-project persisted settings so even legacy or direct database values stay bounded. */
export function projectPublicGymSettings(settings: any, organizationTimeZone?: unknown) {
  if (!settings) return null;
  const name = publicText(settings.name, 200);
  if (!name) return null;

  const logoIcon = sanitizeGymLogoSvg(settings.logoIcon);
  return {
    id: String(settings.id),
    name,
    tagline: publicText(settings.tagline, 300),
    logoIcon: logoIcon || null,
    logoColor: normalizeGymLogoColor(settings.logoColor),
    brandHue: normalizeStorefrontHue(settings.brandHue),
    description: publicText(settings.description, 2_000),
    address: publicText(settings.address, 500),
    phone: publicText(settings.phone, 50),
    email: publicText(settings.email, 320),
    currencyCode: publicText(settings.currencyCode, 3),
    locale: publicText(settings.locale, 20),
    timezone: resolveGymTimeZone(
      publicText(settings.timezone, 100),
      publicText(organizationTimeZone, 100),
    ),
    countryCode: publicText(settings.countryCode, 2),
    hours: publicHours(settings.hours),
    heroEyebrow: publicText(settings.heroEyebrow, 200),
    heroHeadline: publicText(settings.heroHeadline, 1_000),
    heroSubheadline: publicText(settings.heroSubheadline, 2_000),
    heroImagePath: normalizePublicMediaPath(settings.heroImageUrl),
    heroPrimaryCtaLabel: publicText(settings.heroPrimaryCtaLabel, 100),
    heroPrimaryCtaHref: publicInternalHref(settings.heroPrimaryCtaHref),
    heroSecondaryCtaLabel: publicText(settings.heroSecondaryCtaLabel, 100),
    heroSecondaryCtaHref: publicInternalHref(settings.heroSecondaryCtaHref),
    promoBanner: publicText(settings.promoBanner, 500),
    footerTagline: publicText(settings.footerTagline, 500),
    copyrightName: publicText(settings.copyrightName, 200),
    facilityHeadline: publicText(settings.facilityHeadline, 300),
    facilityDescription: publicText(settings.facilityDescription, 2_000),
    facilityHighlights: publicFacilityHighlights(settings.facilityHighlights),
    heroStats: publicHeroStats(settings.heroStats),
    contactTopics: publicContactTopics(settings.contactTopics),
  };
}

function publicContext(context: KeystoneContext) {
  return context.sudo();
}

export async function publicOrganizationId(context: KeystoneContext) {
  const configuredId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  const organizations = await publicContext(context).query.Organization.findMany({
    where: configuredId
      ? { AND: [{ id: { equals: configuredId } }, { status: { equals: "active" } }] }
      : { status: { equals: "active" } },
    take: configuredId ? 1 : 2,
    orderBy: [{ createdAt: "asc" }],
    query: "id",
  });
  if (!configuredId && organizations.length !== 1) return null;
  return organizations[0]?.id ?? null;
}

/**
 * The tenant this storefront serves for accounts, history, recovery, contact and branding,
 * whatever its sales status. A suspended club keeps that private journey; its public catalog
 * (publicOrganizationId, active only) and new sales stay closed.
 */
export async function configuredStorefrontOrganization(context: KeystoneContext): Promise<{ id: string; salesOpen: boolean } | null> {
  const configuredId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  if (configuredId) {
    const rows = await publicContext(context).query.Organization.findMany({ where: { id: { equals: configuredId } }, take: 1, query: "id status" });
    return rows[0] ? { id: String(rows[0].id), salesOpen: rows[0].status === "active" } : null;
  }
  const active = await publicContext(context).query.Organization.findMany({ where: { status: { equals: "active" } }, take: 2, orderBy: [{ createdAt: "asc" }], query: "id" });
  if (active.length === 1) return { id: String(active[0].id), salesOpen: true };
  if (active.length > 1) return null;
  const all = await publicContext(context).query.Organization.findMany({ take: 2, orderBy: [{ createdAt: "asc" }], query: "id" });
  return all.length === 1 ? { id: String(all[0].id), salesOpen: false } : null;
}

function publicTenantWhere(organizationId: string | null, where: Record<string, unknown> = {}) {
  if (!organizationId) return { id: { equals: "__no_public_organization__" } };
  return {
    AND: [
      { organization: { id: { equals: organizationId } } },
      where,
    ],
  };
}

function publicInstructor(instructor: any) {
  if (!instructor) return null;
  return {
    id: instructor.id,
    name: instructor.displayName || instructor.user?.name || "Coach",
    bio: documentToPlainText(instructor.bio),
    specialties: Array.isArray(instructor.specialties) ? instructor.specialties.map(String) : [],
    // Names of listed and current qualifications only; evidence and verification stay private.
    certifications: publicQualificationNames(instructor.certifications),
    imagePath: normalizePublicMediaPath(instructor.photo),
  };
}

function publicSchedule(schedule: any) {
  if (!schedule) return null;
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description || null,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    maxCapacity: schedule.maxCapacity,
    classType: publicClassType(schedule.classType),
    instructor: publicInstructor(schedule.instructor),
  };
}

function publicClassType(classType: any) {
  if (!classType) return null;
  return {
    id: classType.id,
    name: classType.name,
    description: documentToPlainText(classType.description),
    difficulty: classType.difficulty,
    duration: classType.duration,
    caloriesBurn: classType.caloriesBurn ?? null,
    equipmentNeeded: Array.isArray(classType.equipmentNeeded)
      ? classType.equipmentNeeded.map(String)
      : [],
  };
}

function publicMembershipTier(tier: any, providerEnabled = false) {
  if (!tier) return null;
  return {
    id: tier.id,
    name: tier.name,
    description: documentToPlainText(tier.description),
    monthlyPrice: tier.monthlyPrice,
    annualPrice: tier.annualPrice,
    classCreditsPerMonth: tier.classCreditsPerMonth,
    accessHours: tier.accessHours,
    guestPasses: tier.guestPasses,
    personalTrainingSessions: tier.personalTrainingSessions,
    freezeAllowed: tier.freezeAllowed,
    contractLength: tier.contractLength,
    features: Array.isArray(tier.features)
      ? tier.features.filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item: string) => item.slice(0, 120))
      : [],
    // A plan is purchasable only with a mapped price above zero (paid-only service).
    monthlyCheckoutAvailable:
      providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeMonthlyPriceId) && Number(tier.monthlyPrice) > 0,
    annualCheckoutAvailable:
      providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeAnnualPriceId) && Number(tier.annualPrice) > 0,
  };
}

function publicClassInstance(instance: any) {
  if (!instance) return null;
  const confirmedBookings = (instance.bookings ?? []).filter(
    (booking: any) => booking.status === "confirmed"
  ).length;
  const waitlistCount = (instance.bookings ?? []).filter(
    (booking: any) => booking.status === "waitlist"
  ).length;
  const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
  const instructor = instance.instructor ?? instance.classSchedule?.instructor ?? null;
  // The session's own site wins over its template's; only public name and address are shown.
  const site = instance.location ?? instance.classSchedule?.location ?? null;

  return {
    id: instance.id,
    startsAt: instance.date,
    schedule: publicSchedule(instance.classSchedule),
    instructor: publicInstructor(instructor),
    location: site ? { id: site.id, name: publicText(site.name, 200) || "Location", address: publicText(site.address, 500) } : null,
    availability: {
      maxCapacity,
      confirmedBookings,
      waitlistCount,
      spotsRemaining: Math.max(maxCapacity - confirmedBookings, 0),
      state: maxCapacity > confirmedBookings ? "open" : "waitlist",
    },
  };
}

export async function getPublicGymSettings(
  root: unknown,
  args: Record<string, never>,
  context: KeystoneContext
) {
  // Branding and contact identity belong to the configured tenant even while sales are paused.
  const storefront = await configuredStorefrontOrganization(context);
  const organizationId = storefront?.id ?? null;
  const [settingsItems, organizations] = await Promise.all([
    publicContext(context).query.GymSettings.findMany({
      where: publicTenantWhere(organizationId),
      take: 1,
      query: `
        id
        name
        tagline
        logoIcon
        logoColor
        brandHue
        description
        address
        phone
        email
        currencyCode
        locale
        timezone
        countryCode
        hours
        heroEyebrow
        heroHeadline
        heroSubheadline
        heroImageUrl
        heroPrimaryCtaLabel
        heroPrimaryCtaHref
        heroSecondaryCtaLabel
        heroSecondaryCtaHref
        promoBanner
        footerTagline
        copyrightName
        facilityHeadline
        facilityDescription
        facilityHighlights
        heroStats
        contactTopics
      `,
    }),
    organizationId
      ? publicContext(context).query.Organization.findMany({
          where: { id: { equals: organizationId } },
          take: 1,
          query: "timezone",
        })
      : Promise.resolve([]),
  ]);
  const settings = settingsItems[0];
  const organization = organizations[0];
  const projected = projectPublicGymSettings(settings, organization?.timezone);
  if (!projected) return null;
  // Published participation terms (the version members accept), not the editable draft.
  const participationTerms = await currentParticipationTerms(guardKeystonePrismaResults(context.prisma as any), organizationId);
  return { ...projected, participationTerms, salesOpen: Boolean(storefront?.salesOpen) };
}

export async function getPublicGymClassTypes(
  root: unknown,
  args: { limit?: number | null; skip?: number | null; after?: string | null; q?: string | null; difficulty?: string | null; duration?: string | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  // Search, level and length are applied before the page limit, so a later match is reachable.
  const filters: Record<string, unknown>[] = [await afterCursor(context, "ClassType", organizationId, args.after, "name")];
  const q = String(args.q || "").trim().slice(0, 100);
  if (q) filters.push({ name: containsText(q) });
  if (args.difficulty && args.difficulty !== "all") filters.push({ difficulty: { equals: String(args.difficulty).slice(0, 50) } });
  if (args.duration && args.duration !== "all") {
    const minutes = Number(args.duration);
    if (Number.isInteger(minutes) && minutes > 0) filters.push({ duration: minutes >= 75 ? { gte: 75 } : { equals: minutes } });
  }
  const records = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId, { AND: filters }),
    take: normalizePublicLimit(args.limit),
    skip: args.after ? 0 : publicSkip(args.skip),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    query: `id name description { document } difficulty duration caloriesBurn equipmentNeeded`,
  });
  return records.map(publicClassType);
}

export async function getPublicGymClassType(
  root: unknown,
  args: { id: string },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `id name description { document } difficulty duration caloriesBurn equipmentNeeded`,
  });
  return publicClassType(record);
}

export async function getPublicGymSchedules(
  root: unknown,
  args: { dayOfWeek?: string | null; instructorId?: string | null; limit?: number | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.ClassSchedule.findMany({
    where: publicTenantWhere(organizationId, {
      isActive: { equals: true },
      ...(args.dayOfWeek ? { dayOfWeek: { equals: args.dayOfWeek } } : {}),
      ...(args.instructorId ? { instructor: { id: { equals: args.instructorId } } } : {}),
    }),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    query: `
      id name description dayOfWeek startTime endTime maxCapacity
      classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
      instructor { id displayName bio { document } specialties certifications photo }
    `,
  });
  return records.map(publicSchedule);
}

export async function getPublicGymSchedule(
  root: unknown,
  args: { id: string },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassSchedule.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id name description dayOfWeek startTime endTime maxCapacity isActive
      classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
      instructor { id displayName bio { document } specialties certifications photo }
    `,
  });
  return record?.isActive ? publicSchedule(record) : null;
}

export async function getPublicGymClassInstances(
  root: unknown,
  args: {
    from?: string | null;
    to?: string | null;
    scheduleId?: string | null;
    instructorId?: string | null;
    classTypeId?: string | null;
    locationId?: string | null;
    search?: string | null;
    skip?: number | null;
    limit?: number | null;
  },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const window = resolvePublicInstanceWindow(args.from, args.to);
  const skip = Number.isInteger(args.skip) && (args.skip as number) > 0 ? Math.min(args.skip as number, 5_000) : 0;
  // Every filter is applied before the page limit, so a later matching session is never
  // dropped behind a page of unrelated ones; callers page with `skip`.
  const filters: Record<string, unknown>[] = [];
  if (args.instructorId) filters.push({ OR: [
    { instructor: { id: { equals: args.instructorId } } },
    { AND: [{ instructor: null }, { classSchedule: { instructor: { id: { equals: args.instructorId } } } }] },
  ] });
  if (args.locationId) filters.push({ OR: [
    { location: { id: { equals: args.locationId } } },
    { AND: [{ location: null }, { classSchedule: { location: { id: { equals: args.locationId } } } }] },
  ] });
  // Each search word must match the class, its format, level or the session's coach.
  for (const term of String(args.search || "").trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const text = containsText(term.slice(0, 60));
    const levels = CLASS_LEVELS.filter((level) => level.startsWith(term));
    filters.push({ OR: [
      { classSchedule: { name: text } },
      { classSchedule: { classType: { name: text } } },
      ...(levels.length ? [{ classSchedule: { classType: { difficulty: { in: levels } } } }] : []),
      { instructor: { user: { name: text } } },
      { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { name: text } } } }] },
    ] });
  }
  const records = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, {
      date: { gte: window.from, lte: window.to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...(args.scheduleId ? { id: { equals: args.scheduleId } } : {}),
        ...(args.classTypeId ? { classType: { id: { equals: args.classTypeId } } } : {}),
      },
      ...(filters.length ? { AND: filters } : {}),
    }),
    take: normalizePublicLimit(args.limit),
    skip,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    query: `
      id date maxCapacity
      location { id name address isActive }
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity
        location { id name address isActive }
        classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
        instructor { id displayName bio { document } specialties certifications photo }
      }
      bookings { id status }
    `,
  });
  return records.map(publicClassInstance);
}

export async function getPublicGymClassInstance(
  root: unknown,
  args: { id: string },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id date maxCapacity isCancelled
      location { id name address isActive }
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity isActive
        location { id name address isActive }
        classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
        instructor { id displayName bio { document } specialties certifications photo }
      }
      bookings { id status }
    `,
  });
  if (
    !record ||
    record.isCancelled ||
    !record.classSchedule?.isActive ||
    new Date(record.date).getTime() < Date.now()
  ) {
    return null;
  }
  return publicClassInstance(record);
}

export async function getPublicGymInstructors(
  root: unknown,
  args: { limit?: number | null; skip?: number | null; after?: string | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.Instructor.findMany({
    where: publicTenantWhere(organizationId, { AND: [{ isActive: { equals: true } }, await afterCursor(context, "Instructor", organizationId, args.after, null)] }),
    take: normalizePublicLimit(args.limit),
    skip: args.after ? 0 : publicSkip(args.skip),
    orderBy: [{ id: "asc" }],
    query: `id displayName bio { document } specialties certifications photo`,
  });
  // Returned in id order, the order `after` continues from; callers sort for display.
  return records
    .map(publicInstructor)
    .filter((instructor): instructor is NonNullable<ReturnType<typeof publicInstructor>> => Boolean(instructor));
}

export async function getPublicGymInstructor(
  root: unknown,
  args: { id: string },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.Instructor.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `id displayName bio { document } specialties certifications photo isActive`,
  });
  return record?.isActive ? publicInstructor(record) : null;
}

import { installedPaymentProviderWhere, newPaymentChargesEnabled } from "../lib/stripe-environment-provider";
import { currentParticipationTerms } from "../lib/participation-terms";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

/**
 * Whether online checkout would actually be admitted: the same provider rule checkout uses,
 * including the deployment's switch for new card charges. Plans are shown as buyable online only then.
 */
export async function publicCheckoutProviderEnabled(context: KeystoneContext, organizationId: string | null) {
  if (!organizationId) return false;
  const providers = await publicContext(context).query.PaymentProvider.findMany({
    where: publicTenantWhere(organizationId, {
      AND: [{ code: { equals: "pp_stripe" } }, installedPaymentProviderWhere()],
    }),
    take: 1,
    query: "id adapterKey",
  });
  const provider = providers[0] as any;
  if (!provider) return false;
  return provider.adapterKey !== "stripe" || newPaymentChargesEnabled() || process.env.PAYMENT_TEST_MODE === "true";
}

export async function getPublicGymMembershipTiers(
  root: unknown,
  args: { limit?: number | null; skip?: number | null; after?: string | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const providerEnabled = await publicCheckoutProviderEnabled(context, organizationId);
  const mapped = { not: { equals: "" } };
  // With online checkout on, only plans that can be bought are published; the same rule is
  // applied in the query so each page is full and every later published plan stays reachable.
  const purchasable = providerEnabled ? [{ stripeProductId: mapped }, { OR: [
    { AND: [{ stripeMonthlyPriceId: mapped }, { monthlyPrice: { gt: 0 } }] },
    { AND: [{ stripeAnnualPriceId: mapped }, { annualPrice: { gt: 0 } }] },
  ] }] : [];
  const records = await publicContext(context).query.MembershipTier.findMany({
    where: publicTenantWhere(organizationId, { AND: [...purchasable, await afterCursor(context, "MembershipTier", organizationId, args.after, "monthlyPrice")] }),
    take: normalizePublicLimit(args.limit),
    skip: args.after ? 0 : publicSkip(args.skip),
    orderBy: [{ monthlyPrice: "asc" }, { id: "asc" }],
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId features
    `,
  });
  // With online checkout on, a plan is published only once it can be bought;
  // an unmapped draft stays out of public choices (Membership Plans shows why).
  return records
    .map((record: any) => publicMembershipTier(record, providerEnabled))
    .filter((tier: any) => !providerEnabled || tier.monthlyCheckoutAvailable || tier.annualCheckoutAvailable);
}

export async function getPublicGymMembershipTier(
  root: unknown,
  args: { id: string },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const providerEnabled = await publicCheckoutProviderEnabled(context, organizationId);
  const [record] = await publicContext(context).query.MembershipTier.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId features
    `,
  });
  const tier = publicMembershipTier(record, providerEnabled);
  return tier && (!providerEnabled || tier.monthlyCheckoutAvailable || tier.annualCheckoutAvailable) ? tier : null;
}
