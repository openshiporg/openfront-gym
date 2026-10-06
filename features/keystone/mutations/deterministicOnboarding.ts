import crypto from "node:crypto";
import seed from "../onboarding/seed.json";
import { parseGymOnboardingSeed, type GymOnboardingSeed } from "../onboarding/onboardingSchema";
import { upsertGymSettings } from "./gymSettingsLifecycle";
import { updateCapacityControlledClassScheduleInTransaction } from "./classCapacity";
import { futureLocalOccurrence, localWeekdayAtOffset, normalizeTimeZone } from "../../../lib/timezone";
import { guardKeystonePrismaResults, requirePrismaAffectedCount } from "../lib/prisma-result";

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

async function one(query: any, where: any, queryFields: string) {
  const rows = await query.findMany({ where, take: 2, query: queryFields });
  if (rows.length > 1) throw new Error("Onboarding found ambiguous duplicate data");
  if (rows[0] && (typeof rows[0].id !== "string" || !rows[0].id)) throw new Error("Onboarding lookup returned a row without an id");
  return rows[0] as any;
}

function requiredSeedId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Onboarding seed did not produce ${label}`);
  return value;
}

function tenantWhere(organizationId: string, narrower: any = {}) {
  return { AND: [{ organization: { id: { equals: organizationId } } }, narrower] };
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

export async function runDeterministicOnboarding(
  _root: unknown,
  args: { template: string; data?: unknown },
  context: any,
) {
  const template = args.template;
  const onboardingSeed = resolveOnboardingSeed(template, args.data);
  const membershipTiers = onboardingSeed.membershipTiers;
  const classTypesSeed = onboardingSeed.classTypes;
  const instructorsSeed = onboardingSeed.instructors;
  const schedulesSeed = onboardingSeed.schedules;
  const { userId, organizationId } = actorOrganization(context);
  // Stateless sessions retain role snapshots; revalidate the current relationship before sudo or writes.
  const actorUser = await context.query.User.findOne({
    where: { id: userId },
    query: "id onboardingStatus organization { id } role { id canManageOnboarding organization { id } }",
  });
  if (!actorUser || actorUser.organization?.id !== organizationId) throw new Error("Onboarding actor organization mismatch");
  if (actorUser.role?.organization?.id !== organizationId || !actorUser.role?.canManageOnboarding) {
    throw new Error("Onboarding management permission required");
  }
  if (actorUser.onboardingStatus === "dismissed") throw new Error("Dismissed onboarding must be restarted from the dashboard");

  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const sudo = context.sudo();
  const now = new Date();
  const timeZone = normalizeTimeZone(onboardingSeed.gymSettings.timezone || "UTC");
  if (actorUser.onboardingStatus !== "in_progress" && actorUser.onboardingStatus !== "completed") {
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "in_progress" } });
  }

  const leaseToken = crypto.randomUUID();
  const leaseUntil = new Date(now.getTime() + 30 * 60 * 1000);
  let runId: string;
  try {
    const run = await prisma.onboardingRun.upsert({
      where: { organizationId },
      create: { organizationId, status: "failed", attempts: 0, startedAt: null, leaseUntil: null, leaseToken: "" },
      update: {},
      select: { id: true },
    });
    runId = requiredSeedId(run?.id, "onboarding run id");
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true } });
    runId = requiredSeedId(existing?.id, "onboarding run id after concurrent claim");
  }

  const runState = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true, status: true, completedAt: true } });
  const stateRunId = requiredSeedId(runState?.id, "onboarding run state id");
  if (runState?.status === "completed" && runState.completedAt) {
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
    const instanceCount = await sudo.query.ClassInstance.count({ where: tenantWhere(organizationId) });
    return { success: true, organizationId, runId: stateRunId, instanceCount };
  }
  const wasCompleted = runState?.status === "completed" && Boolean(runState.completedAt);
  const claimed = await prisma.onboardingRun.updateMany({
    where: {
      organizationId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      // Completion evidence is never cleared or rewritten. Completed runs return above.
      status: wasCompleted ? "completed" : "running",
      ...(wasCompleted ? {} : { attempts: { increment: 1 }, startedAt: now, lastError: "", completedAt: null }),
      leaseUntil,
      leaseToken,
    },
  });
  if (!claimed.count) {
    // A concurrent caller observes the existing worker rather than marking its run failed.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const current = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true, status: true, completedAt: true, leaseUntil: true } });
      if (current?.status === "completed" && current.completedAt) {
        const currentRunId = requiredSeedId(current.id, "completed onboarding run id");
        await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
        const completedInstances = await sudo.query.ClassInstance.count({ where: tenantWhere(organizationId) });
        return { success: true, organizationId, runId: currentRunId, instanceCount: completedInstances };
      }
      if (current?.status === "failed" && (!current.leaseUntil || new Date(current.leaseUntil).getTime() < Date.now())) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Onboarding is already running; retry after the current run finishes");
  }

  try {
    const org = await sudo.query.Organization.findOne({ where: { id: organizationId }, query: "id" });
    if (!org) throw new Error("Onboarding organization not found");

    await upsertGymSettings(null, { data: onboardingSeed.gymSettings as any }, context);

    const locationSeed = onboardingSeed.location as any;
    let location = await one(sudo.query.Location, tenantWhere(organizationId, { name: { equals: locationSeed.name } }), "id name");
    const locationData = { ...locationSeed, organization: { connect: { id: organizationId } } };
    if (location) location = await sudo.query.Location.updateOne({ where: { id: location.id }, data: locationData, query: "id name" });
    else location = await sudo.query.Location.createOne({ data: locationData, query: "id name" });

    const tiers: Record<string, string> = {};
    for (const tier of membershipTiers) {
      const { handle: tierHandle, ...tierInput } = tier;
      const data = { ...tierInput, description: documentValue(tier.description), organization: { connect: { id: organizationId } } };
      let row = await one(sudo.query.MembershipTier, tenantWhere(organizationId, { name: { equals: tier.name } }), "id name");
      row = row
        ? await sudo.query.MembershipTier.updateOne({ where: { id: row.id }, data, query: "id name" })
        : await sudo.query.MembershipTier.createOne({ data, query: "id name" });
      tiers[tierHandle] = row.id;
    }

    const classTypes: Record<string, string> = {};
    for (const classType of classTypesSeed) {
      const { handle: classTypeHandle, ...classTypeInput } = classType;
      const data = { ...classTypeInput, description: documentValue(classType.description), organization: { connect: { id: organizationId } } };
      let row = await one(sudo.query.ClassType, tenantWhere(organizationId, { name: { equals: classType.name } }), "id name");
      row = row
        ? await sudo.query.ClassType.updateOne({ where: { id: row.id }, data, query: "id name" })
        : await sudo.query.ClassType.createOne({ data, query: "id name" });
      classTypes[classTypeHandle] = row.id;
    }

    if (
      process.env.GYM_DATABASE_TESTS === "true" &&
      process.env.GYM_ONBOARDING_INJECT_FAILURE === "true"
    ) {
      throw new Error("Injected onboarding recovery failure");
    }

    const instructorRoleData = {
      name: "Instructor", canCreateRecords: false, canManageAllRecords: false,
      canSeeOtherPeople: false, canEditOtherPeople: false, canManagePeople: false,
      canManageRoles: false, canAccessDashboard: true, canManageOnboarding: false,
      canManageSettings: false, canManageAppointments: false, canManageCheckIns: false, canManageFacilities: false,
      canManagePrograms: false, canManageCommunications: false, canManageRetail: false,
      canManagePayroll: false, canViewReports: false, isInstructor: true,
      organization: { connect: { id: organizationId } },
    };
    let instructorRole = await one(sudo.query.Role, tenantWhere(organizationId, { name: { equals: "Instructor" } }), "id name");
    instructorRole = instructorRole
      ? await sudo.query.Role.updateOne({ where: { id: requiredSeedId(instructorRole.id, "existing instructor role id") }, data: instructorRoleData, query: "id name" })
      : await sudo.query.Role.createOne({ data: instructorRoleData, query: "id name" });
    const instructorRoleId = requiredSeedId(instructorRole?.id, "instructor role id");

    const instructors: Record<string, string> = {};
    for (const instructor of instructorsSeed) {
      const fullName = `${instructor.firstName} ${instructor.lastName}`.trim();
      let user = await one(sudo.query.User, { email: { equals: instructor.email } }, "id email organization { id } role { id organization { id } }");
      if (user && user.organization?.id !== organizationId) throw new Error(`Instructor email belongs to another organization: ${instructor.email}`);
      if (!user) {
        // Seeded instructors use reserved .invalid addresses and unique random
        // passwords. An operator must replace each address with the real coach's
        // email before sending a password-reset claim link. No real third party
        // receives setup mail and no shared/source-known credential is created.
        const initialPassword = crypto.randomBytes(32).toString("base64url");
        user = await sudo.query.User.createOne({ data: { name: fullName, email: instructor.email, password: initialPassword, organization: { connect: { id: organizationId } }, role: { connect: { id: instructorRoleId } } }, query: "id email organization { id } role { id organization { id } }" });
      } else {
        const userRow = await prisma.user.update({
          where: { id: user.id },
          data: { name: fullName, roleId: instructorRoleId },
          select: { id: true, email: true, organizationId: true },
        });
        user = { ...userRow, organization: { id: userRow.organizationId }, role: { id: instructorRoleId, organization: { id: organizationId } } } as any;
      }
      const instructorUserId = requiredSeedId(user?.id, `instructor user ${instructor.email}`);
      const instructorData = {
        organization: { connect: { id: organizationId } }, user: { connect: { id: instructorUserId } },
        bio: documentValue(instructor.bio), specialties: instructor.specialties ?? [],
        certifications: instructor.certifications ?? [], photo: instructor.photo ?? "", isActive: instructor.isActive ?? true,
      };
      let row = await one(sudo.query.Instructor, tenantWhere(organizationId, { user: { id: { equals: instructorUserId } } }), "id");
      row = row
        ? await sudo.query.Instructor.updateOne({ where: { id: row.id }, data: instructorData, query: "id" })
        : await sudo.query.Instructor.createOne({ data: instructorData, query: "id" });
      instructors[instructor.handle] = row.id;
    }

    const schedules: Array<{ id: string; dayOfWeek: string; startTime: string; maxCapacity: number }> = [];
    for (const schedule of schedulesSeed) {
      const instructorId = requiredSeedId(instructors[schedule.instructorHandle], `instructor ${schedule.instructorHandle}`);
      const classTypeId = requiredSeedId(classTypes[schedule.classTypeHandle], `class type ${schedule.classTypeHandle}`);
      const { instructorHandle: _instructorHandle, classTypeHandle: _classTypeHandle, ...scheduleInput } = schedule;
      const data = {
        ...scheduleInput,
        organization: { connect: { id: organizationId } },
        instructor: { connect: { id: instructorId } },
        classType: { connect: { id: classTypeId } },
      };
      let row = await one(sudo.query.ClassSchedule, tenantWhere(organizationId, { name: { equals: schedule.name }, dayOfWeek: { equals: schedule.dayOfWeek }, startTime: { equals: schedule.startTime }, instructor: { id: { equals: instructorId } } }), "id");
      if (row) {
        const { maxCapacity, ...scheduleData } = data;
        await context.transaction(async (txContext: any) => {
          const transactionPrisma = guardKeystonePrismaResults(txContext.prisma as any);
          await updateCapacityControlledClassScheduleInTransaction(transactionPrisma, {
            classScheduleId: row.id,
            maxCapacity,
            organizationId,
          }, async () => {
            await txContext.sudo().query.ClassSchedule.updateOne({
              where: { id: row.id },
              data: scheduleData,
              query: "id",
            });
          });
        });
      } else {
        row = await sudo.query.ClassSchedule.createOne({ data, query: "id" });
      }
      schedules.push({ id: row.id, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, maxCapacity: schedule.maxCapacity });
    }

    const instanceIds: string[] = [];
    for (const schedule of schedules) {
      for (let offset = 0; offset <= 14; offset += 1) {
        const date = dateForSchedule(schedule.dayOfWeek, schedule.startTime, offset, now, timeZone);
        if (!date || date.getTime() < Date.now()) continue;
        const iso = date.toISOString();
        let instance = await one(sudo.query.ClassInstance, tenantWhere(organizationId, { classSchedule: { id: { equals: schedule.id } }, date: { equals: iso } }), "id");
        const data = { organization: { connect: { id: organizationId } }, classSchedule: { connect: { id: schedule.id } }, date: iso, maxCapacity: schedule.maxCapacity };
        // Replay never rewrites an existing operational occurrence: capacity,
        // cancellation, and bookings may have changed after its first creation.
        instance = instance
          ? instance
          : await sudo.query.ClassInstance.createOne({ data: { ...data, isCancelled: false }, query: "id" });
        instanceIds.push(instance.id);
      }
    }

    let provider = await one(sudo.query.PaymentProvider, tenantWhere(organizationId, { code: { equals: "pp_stripe" } }), "id");
    const stripeConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    );
    const providerData = {
      organization: { connect: { id: organizationId } },
      name: "Stripe",
      code: "pp_stripe",
      adapterKey: "stripe",
      providerAccountId: process.env.STRIPE_ACCOUNT_ID?.trim() || null,
      isInstalled: stripeConfigured,
      metadata: {
        credentialSource: "environment",
        purpose: "membership-billing",
        setupRequired: !stripeConfigured,
      },
    };
    const existingProviderId = provider ? requiredSeedId(provider.id, "existing payment provider id") : null;
    provider = existingProviderId
      ? await sudo.query.PaymentProvider.updateOne({ where: { id: existingProviderId }, data: providerData, query: "id" })
      : await sudo.query.PaymentProvider.createOne({ data: providerData, query: "id" });

    const completed = await prisma.onboardingRun.updateMany({ where: { organizationId, leaseToken }, data: { status: "completed", completedAt: new Date(), lastError: "", leaseUntil: null, leaseToken: "" } });
    requirePrismaAffectedCount(completed, 1, "onboarding completion fence");
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
    return { success: true, organizationId, runId, instanceCount: instanceIds.length };
  } catch (error) {
    await prisma.onboardingRun.updateMany({ where: { organizationId, leaseToken }, data: { status: wasCompleted ? "completed" : "failed", ...(wasCompleted ? {} : { lastError: error instanceof Error ? error.message.slice(0, 2000) : "Onboarding failed" }), leaseUntil: null, leaseToken: "" } });
    throw error;
  }
}
