import type { KeystoneContext } from "@keystone-6/core/types";
import { resolveGymTimeZone } from "../../../lib/timezone";
import { sanitizeGymLogoSvg } from "../utils/gymLogo";
import { normalizeStorefrontHue } from "../../platform/store-settings/lib/storefront-branding";

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

function publicInternalHref(value: unknown): string | null {
  const href = publicText(value, 500);
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.includes("..") || href.includes("\\")) {
    return null;
  }
  return href;
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

async function publicOrganizationId(context: KeystoneContext) {
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
    certifications: Array.isArray(instructor.certifications) ? instructor.certifications.map(String) : [],
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
    monthlyCheckoutAvailable:
      providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeMonthlyPriceId),
    annualCheckoutAvailable:
      providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeAnnualPriceId),
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

  return {
    id: instance.id,
    startsAt: instance.date,
    schedule: publicSchedule(instance.classSchedule),
    instructor: publicInstructor(instructor),
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
  const organizationId = await publicOrganizationId(context);
  const [settingsItems, organizations] = await Promise.all([
    publicContext(context).query.GymSettings.findMany({
      where: publicTenantWhere(organizationId),
      take: 1,
      query: `
        id
        name
        tagline
        logoIcon
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

  return projectPublicGymSettings(settings, organization?.timezone);
}

export async function getPublicGymClassTypes(
  root: unknown,
  args: { limit?: number | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ name: "asc" }],
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
    limit?: number | null;
  },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const window = resolvePublicInstanceWindow(args.from, args.to);
  const records = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, {
      date: { gte: window.from, lte: window.to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...(args.scheduleId ? { id: { equals: args.scheduleId } } : {}),
      },
      ...(args.instructorId
        ? {
            OR: [
              { instructor: { id: { equals: args.instructorId } } },
              { classSchedule: { instructor: { id: { equals: args.instructorId } } } },
            ],
          }
        : {}),
    }),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ date: "asc" }],
    query: `
      id date maxCapacity
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity
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
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity isActive
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
  args: { limit?: number | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.Instructor.findMany({
    where: publicTenantWhere(organizationId, { isActive: { equals: true } }),
    take: normalizePublicLimit(args.limit),
    query: `id displayName bio { document } specialties certifications photo`,
  });
  return records
    .map(publicInstructor)
    .filter((instructor): instructor is NonNullable<ReturnType<typeof publicInstructor>> => Boolean(instructor))
    .sort((left, right) => left.name.localeCompare(right.name));
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

async function publicCheckoutProviderEnabled(context: KeystoneContext, organizationId: string | null) {
  if (!organizationId) return false;
  const providers = await publicContext(context).query.PaymentProvider.findMany({
    where: publicTenantWhere(organizationId, {
      AND: [{ code: { equals: "pp_stripe" } }, { isInstalled: { equals: true } }],
    }),
    take: 1,
    query: "id",
  });
  return Boolean(providers[0]);
}

export async function getPublicGymMembershipTiers(
  root: unknown,
  args: { limit?: number | null },
  context: KeystoneContext
) {
  const organizationId = await publicOrganizationId(context);
  const providerEnabled = await publicCheckoutProviderEnabled(context, organizationId);
  const records = await publicContext(context).query.MembershipTier.findMany({
    where: publicTenantWhere(organizationId),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ monthlyPrice: "asc" }],
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId
    `,
  });
  return records.map((record: any) => publicMembershipTier(record, providerEnabled));
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
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId
    `,
  });
  return publicMembershipTier(record, providerEnabled);
}
