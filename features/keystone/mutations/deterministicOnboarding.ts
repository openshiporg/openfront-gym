import crypto from "node:crypto";
import seed from "../onboarding/seed.json";
import { parseGymOnboardingSeed, type GymOnboardingSeed } from "../onboarding/onboardingSchema";
import { normalizeGymSettingsInput } from "./gymSettingsLifecycle";
import { DEFAULT_GYM_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR } from "../lib/storefront-branding";
import { editorWeeklyHours } from "../lib/gym-hours";
import { lockTransactionKey } from "./classCapacity";
import { saveControlledOccurrence } from "../lib/class-scheduling";
import { futureLocalOccurrence, localWeekdayAtOffset } from "../../../lib/timezone";
import { businessTimeZone } from "../lib/business-time-zone";
import { lockCurrentActor } from "../lib/current-actor";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { publicCheckoutProviderEnabled } from "../queries/publicGym";
import { isParticipationTermsPlaceholder } from "../lib/participation-terms";

const dayNumbers: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const documentValue = (value: unknown) =>
  typeof value === "string" && value.length > 0
    ? [{ type: "paragraph", children: [{ text: value }] }]
    : [{ type: "paragraph", children: [{ text: "" }] }];

function actorOrganization(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  if (!session.data?.role?.canManageOnboarding) throw new Error("Onboarding management permission required");
  return { userId: session.itemId as string, organizationId: organizationId as string };
}

function requiredSeedId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Onboarding seed did not produce ${label}`);
  return value;
}

function dateForSchedule(dayOfWeek: string, startTime: string, offset: number, now: Date, timeZone: string) {
  const target = dayNumbers[dayOfWeek];
  if (localWeekdayAtOffset(now, timeZone, offset) !== target) return null;
  const [hours, minutes] = startTime.split(":").map(Number);
  return futureLocalOccurrence(now, timeZone, offset, hours || 0, minutes || 0);
}

export function resolveOnboardingSeed(template: string, customData?: unknown): GymOnboardingSeed {
  if (!['minimal', 'full', 'custom'].includes(template)) throw new Error('Unknown onboarding template');
  if (template === 'custom') {
    if (customData == null) throw new Error('Custom onboarding requires a configuration');
    return parseGymOnboardingSeed(customData);
  }

  const canonical = parseGymOnboardingSeed(seed);
  if (template === 'full') return canonical;
  const classTypes = canonical.classTypes.filter((item) => item.handle === 'yoga');
  const classTypeHandles = new Set(classTypes.map((item) => item.handle));
  const instructors = canonical.instructors
    .filter((item) => item.handle === 'sarah-johnson')
    .map((item) => ({
      ...item,
      teachesClassTypes: item.teachesClassTypes.filter((classTypeHandle) => classTypeHandles.has(classTypeHandle)),
    }));
  const instructorHandles = new Set(instructors.map((item) => item.handle));
  return {
    ...canonical,
    membershipTiers: canonical.membershipTiers.filter((item) => item.handle === 'basic-monthly'),
    classTypes,
    instructors,
    schedules: canonical.schedules.filter(
      (item) => classTypeHandles.has(item.classTypeHandle) && instructorHandles.has(item.instructorHandle),
    ),
  };
}

/** The predefined coach role setup may provision: dashboard access for own sessions, nothing else. */
const BOUNDED_INSTRUCTOR_ROLE = {
  canCreateRecords: false, canManageAllRecords: false, canSeeOtherPeople: false, canEditOtherPeople: false,
  canManagePeople: false, canManageRoles: false, canAccessDashboard: true, canManageOnboarding: false,
  canManageSettings: false, canManageAppointments: false, canManageCheckIns: false, canManageFacilities: false,
  canManagePrograms: false, canManageCommunications: false, canManageRetail: false, canManagePayroll: false,
  canViewReports: false, isInstructor: true,
} as const;

/** A starter coach's reserved address, unique to this tenant so tenants never share an identity. */
export function placeholderCoachEmail(seedEmail: string, organizationId: string) {
  const local = seedEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const tenant = crypto.createHash("sha256").update(organizationId).digest("hex").slice(0, 12);
  return `${local}+${tenant}@example.invalid`;
}

type Manifest = {
  version: 2;
  template: string;
  configHash: string;
  completedAt?: string;
  records: Record<string, unknown>;
  created: string[];
  adopted: string[];
  placeholderUsers: Record<string, { handle: string; seedEmail: string; claimEmail?: string; claimIssuedAt?: string; claimIssuedBy?: string; claimedAt?: string }>;
  skippedSessions: Array<{ schedule: string; date: string; reason: string }>;
};

const PRICE_ID = /^price_[A-Za-z0-9]+$/;
const PRODUCT_ID = /^prod_[A-Za-z0-9]+$/;

/** Which starter records still exist, from the manifest's own mapped IDs (not row counts). */
async function manifestRecords(tx: any, manifest: Manifest | null) {
  const created: Record<string, number> = {};
  const adoptedCounts: Record<string, number> = {};
  for (const entry of manifest?.created ?? []) { const kind = entry.split(":")[0]; created[kind] = (created[kind] ?? 0) + 1; }
  for (const entry of manifest?.adopted ?? []) { const kind = entry.split(":")[0]; adoptedCounts[kind] = (adoptedCounts[kind] ?? 0) + 1; }
  const delegates: Record<string, string> = { settings: "gymSettings", location: "location", membershipTier: "membershipTier", classType: "classType", role: "role", user: "user", instructor: "instructor", classSchedule: "classSchedule", paymentProvider: "paymentProvider" };
  const missing: string[] = [];
  for (const entry of [...(manifest?.created ?? []), ...(manifest?.adopted ?? [])]) {
    const [kind, id] = entry.split(":");
    const delegate = delegates[kind];
    if (!delegate || !id) continue;
    if (!(await tx[delegate].count({ where: { id } }))) missing.push(entry);
  }
  return { created, adopted: adoptedCounts, missing, configurationRecorded: Boolean(manifest?.configHash) };
}

/**
 * What a working gym needs, read from current records, with the page that finishes each step.
 * Records created by setup are reported separately: creating them is not readiness. Online
 * checkout is judged with the same provider admission public checkout uses, and plan price IDs
 * are only format-checked (they are not verified with Stripe here). Financial, attendance,
 * consent and credential tables stay empty until real use.
 */
export async function onboardingReadiness(context: any, tx: any, organizationId: string, manifest: Manifest | null = null) {
  const now = new Date();
  const checkoutOpen = await publicCheckoutProviderEnabled(context, organizationId);
  const [settings, locations, plans, mappedPlans, classTypes, coaches, scheduleRows, resources, availability, retailItems, policy, members, exercises, credentials, legacyWaitlist] = await Promise.all([
    tx.gymSettings.findFirst({ where: { organizationId }, select: { email: true, hours: true } }),
    tx.location.count({ where: { organizationId, isActive: true } }),
    tx.membershipTier.count({ where: { organizationId } }),
    tx.membershipTier.findMany({ where: { organizationId, stripeProductId: { not: "" } }, select: { stripeProductId: true, stripeMonthlyPriceId: true, stripeAnnualPriceId: true, monthlyPrice: true, annualPrice: true }, take: 500 }),
    tx.classType.count({ where: { organizationId } }),
    tx.instructor.count({ where: { organizationId, isActive: true } }),
    tx.classSchedule.findMany({ where: { organizationId, isActive: true }, select: { id: true, instructor: { select: { isActive: true } }, location: { select: { isActive: true } } }, take: 500 }),
    tx.gymResource.count({ where: { organizationId, isActive: true } }),
    tx.trainerAvailability.count({ where: { organizationId } }),
    tx.retailItem.count({ where: { organizationId, isActive: true } }),
    tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { documentText: true, documentReference: true, enforceWaiver: true } }),
    tx.member.count({ where: { organizationId } }),
    tx.exercise.count({ where: { organizationId } }),
    tx.integrationCredential.count({ where: { organizationId, revokedAt: null, expiresAt: { gt: now } } }),
    tx.waitlist.count({ where: { organizationId } }),
  ]);
  const purchasable = (mappedPlans as any[]).filter((plan) => PRODUCT_ID.test(plan.stripeProductId) && (
    (PRICE_ID.test(plan.stripeMonthlyPriceId || "") && Number(plan.monthlyPrice) > 0) || (PRICE_ID.test(plan.stripeAnnualPriceId || "") && Number(plan.annualPrice) > 0)
  )).length;
  // A schedule counts only with its coach and site active and an upcoming session of its own.
  const liveSchedules = (scheduleRows as any[]).filter((row) => row.instructor?.isActive !== false && row.location?.isActive !== false);
  const sessions = liveSchedules.length ? await tx.classInstance.count({ where: { organizationId, isCancelled: false, date: { gt: now }, classScheduleId: { in: liveSchedules.map((row: any) => row.id) } } }) : 0;
  const reviewedTerms = Boolean(policy?.documentText && !isParticipationTermsPlaceholder(String(policy.documentText))) || Boolean(policy && !policy.documentText && /^https:\/\//.test(String(policy.documentReference || "")));
  type Kind = "required" | "optional" | "first-use";
  const step = (key: string, label: string, done: boolean, href: string, kind: Kind = "required") => ({ key, label, done, required: kind === "required", kind, href });
  const steps = [
    step("settings", "Store Settings: name, contact email and opening hours", Boolean(settings?.hours && Object.keys(settings.hours as object).length && settings?.email && !String(settings.email).endsWith(".invalid")), "/dashboard/platform/store-settings"),
    step("location", "At least one open location", locations > 0, "/dashboard/platform/locations"),
    step("plans", "Membership plans", plans > 0, "/dashboard/platform/membership-plans"),
    checkoutOpen
      ? step("checkout", "Online checkout is on: at least one plan has a Stripe product and price ID above zero (IDs are format-checked only, not verified with Stripe)", purchasable > 0, "/dashboard/platform/membership-plans")
      : step("checkout", "Online checkout is off, so no plan can be bought online; members join at the front desk", true, "/dashboard/platform/membership-plans", "optional"),
    step("classes", "Class types", classTypes > 0, "/dashboard/platform/class-catalog"),
    step("coaches", "Active coaches", coaches > 0, "/dashboard/platform/instructors"),
    step("schedule", "Weekly schedule with an active coach and site, and upcoming sessions", liveSchedules.length > 0 && sessions > 0, "/dashboard/platform/scheduling"),
    step("terms", "Your reviewed participation terms, published from Store Settings", reviewedTerms, "/dashboard/platform/store-settings", "optional"),
    step("resources", "Rooms and equipment for scheduling", resources > 0, "/dashboard/gym-resources", "optional"),
    step("availability", "Personal-training availability", availability > 0, "/dashboard/platform/training", "optional"),
    step("retail", "Front-desk retail items", retailItems > 0, "/dashboard/platform/retail", "optional"),
    step("exercises", "Exercise catalog for workout logs", exercises > 0, "/dashboard/exercises", "optional"),
    step("integrations", "Partner integration credentials", credentials > 0, "/dashboard/platform/operations", "optional"),
    step("members", "Members: invite or import them, or let them sign up", members > 0, "/dashboard/platform/members", "first-use"),
    step("imports", "Contact imports, if you are moving from another system", false, "/dashboard/platform/imports", "first-use"),
    step("coaching", "Coaching assignments and trial follow-up start with real members", false, "/dashboard/platform/training", "first-use"),
    step("privacy", "Consent, privacy requests and acceptances are recorded by members themselves", false, "/dashboard/platform/operations", "first-use"),
  ];
  if (legacyWaitlist > 0) steps.push(step("legacy-waitlist", `${legacyWaitlist} older schedule-level waitlist entries exist; live booking uses each session's own waitlist`, false, "/dashboard/waitlists", "optional"));
  return { ready: steps.every((item) => !item.required || item.done), steps, records: await manifestRecords(tx, manifest) };
}

export async function runDeterministicOnboarding(
  _root: unknown,
  args: { template: string; data?: unknown },
  context: any,
) {
  const template = args.template;
  const onboardingSeed = resolveOnboardingSeed(template, args.data);
  const { userId, organizationId } = actorOrganization(context);
  // Early refusal from the current record; the authoritative check runs again after the lock.
  const actorUser = await context.query.User.findOne({
    where: { id: userId },
    query: "id onboardingStatus organization { id } role { id canManageOnboarding organization { id } }",
  });
  if (!actorUser || actorUser.organization?.id !== organizationId) throw new Error("Onboarding actor organization mismatch");
  if (actorUser.role?.organization?.id !== organizationId || !actorUser.role?.canManageOnboarding) {
    throw new Error("Onboarding management permission required");
  }
  if (actorUser.onboardingStatus === "dismissed") throw new Error("Dismissed onboarding must be restarted from the dashboard");
  const configHash = crypto.createHash("sha256").update(JSON.stringify({ template, seed: onboardingSeed })).digest("hex");

  // The whole setup is ONE transaction under the tenant's onboarding lock: a second request
  // waits, a stalled or failed run leaves nothing behind, and every write is fenced.
  return context.transaction(async (txContext: any) => {
    const tx = guardKeystonePrismaResults(txContext.prisma as any);
    const sudo = txContext.sudo();
    await lockTransactionKey(tx, `onboarding:${organizationId}`);
    // Authority as it stands after the wait, fenced until this transaction ends.
    await lockCurrentActor(tx, userId, organizationId, ["canManageOnboarding"]);
    const current = await tx.user.findUnique({ where: { id: userId }, select: { onboardingStatus: true } });
    if (current?.onboardingStatus === "dismissed") throw new Error("Dismissed onboarding must be restarted from the dashboard");
    const run = await tx.onboardingRun.findUnique({ where: { organizationId } });
    const previous = (run?.manifest || null) as Manifest | null;

    if (run?.status === "completed") {
      // A completed setup is never re-applied. Without its recorded configuration (older
      // setups) the request can't be verified against what was created, so it isn't accepted
      // as "already done" either.
      if (!previous?.configHash) {
        throw new Error("Setup was completed before its configuration was recorded, so this request can't be checked against it. Change plans, classes and coaches from their pages instead of rerunning setup.");
      }
      if (previous.configHash !== configHash) {
        throw new Error("Setup already completed with a different starter configuration. Change plans, classes and coaches from their pages instead of rerunning setup.");
      }
      await tx.user.updateMany({ where: { id: userId, organizationId }, data: { onboardingStatus: "completed" } });
      const readiness = await onboardingReadiness(txContext, tx, organizationId, previous);
      const instanceCount = await tx.classInstance.count({ where: { organizationId } });
      return { success: true, organizationId, runId: run.id, instanceCount, readiness };
    }

    const manifest: Manifest = { version: 2, template, configHash, records: {}, created: [], adopted: [], placeholderUsers: { ...(previous?.placeholderUsers || {}) }, skippedSessions: [] };
    const created = (kind: string, id: string) => { manifest.created.push(`${kind}:${id}`); return id; };
    const adopted = (kind: string, id: string) => { manifest.adopted.push(`${kind}:${id}`); return id; };

    // Store Settings: created once; an existing record is the merchant's. Only a missing logo
    // mark is filled in; its colour, text and legal terms stay as the merchant set them.
    const existingSettings = await tx.gymSettings.findFirst({ where: { organizationId }, select: { id: true, logoIcon: true } });
    if (existingSettings) {
      manifest.records.settings = adopted("settings", existingSettings.id);
      if (!existingSettings.logoIcon) await tx.gymSettings.update({ where: { id: existingSettings.id }, data: { logoIcon: DEFAULT_GYM_LOGO_ICON } });
    } else {
      const { participationTerms: _terms, ...seedSettings } = onboardingSeed.gymSettings as any;
      const values = normalizeGymSettingsInput({
        logoIcon: DEFAULT_GYM_LOGO_ICON, logoColor: DEFAULT_LIBRARY_LOGO_COLOR,
        ...seedSettings,
        ...(seedSettings.hours ? { hours: editorWeeklyHours(seedSettings.hours) } : {}),
      });
      const row = await sudo.db.GymSettings.createOne({ data: { ...values, organization: { connect: { id: organizationId } } } });
      manifest.records.settings = created("settings", String(row.id));
    }
    // Participation terms are published only by a deliberate, authorized review in Store
    // Settings; setup never publishes seed or placeholder text as the club's legal terms.
    // Sessions use the club's saved business timezone (an adopted record's, not the seed's).
    const timeZone = await businessTimeZone(tx, organizationId);

    const locationSeed = onboardingSeed.location as any;
    const existingLocation = await tx.location.findFirst({ where: { organizationId, name: locationSeed.name }, select: { id: true } });
    const locationId = existingLocation
      ? adopted("location", existingLocation.id)
      : created("location", String((await sudo.query.Location.createOne({ data: { ...locationSeed, organization: { connect: { id: organizationId } } }, query: "id" })).id));
    manifest.records.location = locationId;

    const tiers: Record<string, string> = {};
    for (const tier of onboardingSeed.membershipTiers) {
      const { handle: tierHandle, ...tierInput } = tier;
      const existing = await tx.membershipTier.findFirst({ where: { organizationId, name: tier.name }, select: { id: true } });
      tiers[tierHandle] = existing
        ? adopted("membershipTier", existing.id)
        : created("membershipTier", String((await sudo.query.MembershipTier.createOne({ data: { ...tierInput, description: documentValue(tier.description), organization: { connect: { id: organizationId } } }, query: "id" })).id));
    }
    manifest.records.membershipTiers = tiers;

    const classTypes: Record<string, string> = {};
    for (const classType of onboardingSeed.classTypes) {
      const { handle: classTypeHandle, ...classTypeInput } = classType;
      const existing = await tx.classType.findFirst({ where: { organizationId, name: classType.name }, select: { id: true } });
      classTypes[classTypeHandle] = existing
        ? adopted("classType", existing.id)
        : created("classType", String((await sudo.query.ClassType.createOne({ data: { ...classTypeInput, description: documentValue(classType.description), organization: { connect: { id: organizationId } } }, query: "id" })).id));
    }
    manifest.records.classTypes = classTypes;

    if (
      process.env.GYM_DATABASE_TESTS === "true" &&
      process.env.GYM_ONBOARDING_INJECT_FAILURE === "true"
    ) {
      throw new Error("Injected onboarding recovery failure");
    }

    // The predefined bounded coach role: an existing role with exactly these capabilities is
    // reused; otherwise one is created with exactly them. This bounded provisioning never
    // grants anything else, so the general anti-escalation rule on Role/User edits still holds.
    const roles = await tx.role.findMany({ where: { organizationId }, take: 200 });
    const bounded = roles.find((role: any) => Object.entries(BOUNDED_INSTRUCTOR_ROLE).every(([key, value]) => role[key] === value));
    let instructorRoleId: string;
    if (bounded) instructorRoleId = adopted("role", bounded.id);
    else {
      const names = new Set(roles.map((role: any) => role.name));
      const name = names.has("Instructor") ? "Coach (setup)" : "Instructor";
      instructorRoleId = created("role", (await tx.role.create({ data: { ...BOUNDED_INSTRUCTOR_ROLE, name, organizationId } })).id);
    }
    manifest.records.instructorRole = instructorRoleId;

    const instructors: Record<string, string> = {};
    for (const instructor of onboardingSeed.instructors) {
      const fullName = `${instructor.firstName} ${instructor.lastName}`.trim();
      const tenantEmail = placeholderCoachEmail(instructor.email, organizationId);
      // A tenant onboarded earlier may hold the legacy shared address; only its own row is reused.
      const existingUser = await tx.user.findFirst({ where: { organizationId, email: { in: [tenantEmail, instructor.email.toLowerCase()] } }, select: { id: true, email: true } });
      let instructorUserId: string;
      if (existingUser) {
        instructorUserId = adopted("user", existingUser.id);
      } else {
        // Reserved .invalid address and a unique random password: nobody can sign in to this
        // placeholder. Handing it to the real coach is on hold pending the family credential
        // security review; its provenance is recorded below.
        const user = await sudo.db.User.createOne({ data: { name: fullName, email: tenantEmail, password: crypto.randomBytes(32).toString("base64url"), organization: { connect: { id: organizationId } } } });
        instructorUserId = created("user", String(user.id));
        await tx.user.update({ where: { id: instructorUserId }, data: { roleId: instructorRoleId } });
        manifest.placeholderUsers[instructorUserId] = { handle: instructor.handle, seedEmail: tenantEmail };
      }
      const existingInstructor = await tx.instructor.findFirst({ where: { organizationId, userId: instructorUserId }, select: { id: true } });
      instructors[instructor.handle] = existingInstructor
        ? adopted("instructor", existingInstructor.id)
        : created("instructor", String((await sudo.query.Instructor.createOne({ data: {
          organization: { connect: { id: organizationId } }, user: { connect: { id: instructorUserId } },
          bio: documentValue(instructor.bio), specialties: instructor.specialties ?? [],
          certifications: instructor.certifications ?? [], photo: instructor.photo ?? "", isActive: instructor.isActive ?? true,
        }, query: "id" })).id));
    }
    manifest.records.instructors = instructors;

    // Schedules belong to the starter location; sessions come from the same controlled service
    // operators use (site, end time, stable key, coach/room/closure/qualification checks).
    const schedules: Array<{ id: string; name: string; dayOfWeek: string; startTime: string; isActive: boolean }> = [];
    for (const schedule of onboardingSeed.schedules) {
      const instructorId = requiredSeedId(instructors[schedule.instructorHandle], `instructor ${schedule.instructorHandle}`);
      const classTypeId = requiredSeedId(classTypes[schedule.classTypeHandle], `class type ${schedule.classTypeHandle}`);
      const { instructorHandle: _instructorHandle, classTypeHandle: _classTypeHandle, ...scheduleInput } = schedule;
      const existing = await tx.classSchedule.findFirst({ where: { organizationId, name: schedule.name, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, instructorId }, select: { id: true, isActive: true } });
      const id = existing
        ? adopted("classSchedule", existing.id)
        : created("classSchedule", String((await sudo.query.ClassSchedule.createOne({ data: {
          ...scheduleInput,
          organization: { connect: { id: organizationId } },
          instructor: { connect: { id: instructorId } },
          classType: { connect: { id: classTypeId } },
          location: { connect: { id: locationId } },
        }, query: "id" })).id));
      schedules.push({ id, name: schedule.name, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, isActive: existing ? existing.isActive : schedule.isActive !== false });
    }

    const now = new Date();
    let instanceCount = 0;
    for (const schedule of schedules) {
      if (!schedule.isActive) continue;
      for (let offset = 0; offset <= 14; offset += 1) {
        const date = dateForSchedule(schedule.dayOfWeek, schedule.startTime, offset, now, timeZone);
        if (!date || date <= now) continue;
        const key = `${schedule.id}:${date.toISOString()}`;
        const found = await tx.classInstance.findFirst({ where: { organizationId, classScheduleId: schedule.id, OR: [{ occurrenceKey: key }, { date }] }, select: { id: true } });
        if (found) { instanceCount += 1; continue; }
        try {
          await saveControlledOccurrence(tx, organizationId, { classScheduleId: schedule.id, date, actorId: userId });
          instanceCount += 1;
        } catch (error) {
          // A conflicting coach, room, closure or qualification skips that one session.
          manifest.skippedSessions.push({ schedule: schedule.name, date: date.toISOString(), reason: error instanceof Error ? error.message.slice(0, 300) : "Not allocatable" });
        }
      }
    }

    const provider = await tx.paymentProvider.findFirst({ where: { organizationId, code: "pp_stripe" }, select: { id: true } });
    if (provider) manifest.records.paymentProvider = adopted("paymentProvider", provider.id);
    else {
      const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
      manifest.records.paymentProvider = created("paymentProvider", String((await sudo.query.PaymentProvider.createOne({ data: {
        organization: { connect: { id: organizationId } }, name: "Stripe", code: "pp_stripe", adapterKey: "stripe",
        providerAccountId: process.env.STRIPE_ACCOUNT_ID?.trim() || null, isInstalled: stripeConfigured,
        metadata: { credentialSource: "environment", purpose: "membership-billing", setupRequired: !stripeConfigured },
      }, query: "id" })).id));
    }

    manifest.completedAt = new Date().toISOString();
    const runData = { status: "completed", completedAt: new Date(), lastError: "", leaseUntil: null, leaseToken: "", startedAt: now, manifest };
    const saved = run
      ? await tx.onboardingRun.update({ where: { id: run.id }, data: { ...runData, attempts: { increment: 1 } } })
      : await tx.onboardingRun.create({ data: { ...runData, organizationId, attempts: 1 } });
    await tx.user.updateMany({ where: { id: userId, organizationId }, data: { onboardingStatus: "completed" } });
    const readiness = await onboardingReadiness(txContext, tx, organizationId, manifest);
    return { success: true, organizationId, runId: saved.id, instanceCount, readiness, skippedSessions: manifest.skippedSessions };
  }, { maxWait: 30_000, timeout: 120_000 });
}
