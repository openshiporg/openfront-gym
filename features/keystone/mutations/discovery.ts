import { createHash, timingSafeEqual } from "node:crypto";
import { GraphQLError } from "graphql";
import { budgetKey, consumeAuthAttempt, releaseAuthAttempt, reserveAuthAttempt } from "../../../lib/authRateLimit";
import { isKnownSource, requestClientSource } from "../../../lib/clientSource";
import { createCapacityControlledBooking } from "./classCapacity";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

function resolveWindow(from?: string | null, to?: string | null) {
  const now = new Date();
  const requestedStart = from ? new Date(from) : now;
  if (Number.isNaN(requestedStart.getTime())) throw new Error('Invalid discovery date window.');
  const start = new Date(Math.max(requestedStart.getTime(), now.getTime()));
  const requestedEnd = to ? new Date(to) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(requestedEnd.getTime())) throw new Error('Invalid discovery date window.');
  if (requestedEnd < start) throw new Error('Discovery date window must end after it starts.');
  const maximumEnd = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

  return {
    from: start.toISOString(),
    to: new Date(Math.min(requestedEnd.getTime(), maximumEnd.getTime())).toISOString(),
  };
}

function normalizeLocationName(value?: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

export async function getDiscoveryClassFeed(context: any, options: {
  organizationId: string;
  from?: string | null;
  to?: string | null;
  dayOfWeek?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  limit?: number;
  skip?: number;
}) {
  const ctx = context.sudo();
  const { from, to } = resolveWindow(options?.from, options?.to);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 201);
  const skip = Math.min(Math.max(Math.trunc(options?.skip ?? 0), 0), 5000);

  // The requested site is resolved and applied before the feed limit, so its sessions are
  // never crowded out by other sites' earlier sessions. Partners page with `skip`.
  const activeLocations = await ctx.query.Location.findMany({
    where: { AND: [{ organization: { id: { equals: options.organizationId } } }, { isActive: { equals: true } }] },
    take: 100,
    query: 'id name address phone',
  });
  const requestedLocationName = normalizeLocationName(options?.locationName);
  const requestedLocation = options?.locationId
    ? activeLocations.find((location: any) => location.id === options.locationId) ?? null
    : requestedLocationName
      ? activeLocations.find((location: any) => normalizeLocationName(location.name) === requestedLocationName) ?? null
      : null;
  if ((options?.locationId || options?.locationName) && !requestedLocation) {
    return [];
  }

  const instances = await ctx.query.ClassInstance.findMany({
    where: {
      organization: { id: { equals: options.organizationId } },
      date: { gte: from, lte: to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...(options?.dayOfWeek ? { dayOfWeek: { equals: options.dayOfWeek } } : {}),
      },
      ...(requestedLocation ? { OR: [
        { location: { id: { equals: requestedLocation.id } } },
        { AND: [{ location: null }, { classSchedule: { location: { id: { equals: requestedLocation.id } } } }] },
      ] } : {}),
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: limit,
    skip,
    query: `
      id
      date
      endsAt
      location { id name address phone isActive }
      maxCapacity
      classSchedule {
        id
        name
        description
        dayOfWeek
        startTime
        endTime
        maxCapacity
        location { id name address phone isActive }
      }
      instructor {
        id
        user { id name email }
      }
      bookings {
        id
        status
        waitlistPosition
      }
    `,
  });

  return instances
    .map((instance: any) => {
    const confirmedBookings = (instance.bookings ?? []).filter((booking: any) => booking.status === 'confirmed').length;
    const waitlistCount = (instance.bookings ?? []).filter((booking: any) => booking.status === 'waitlist').length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    const spotsRemaining = Math.max(maxCapacity - confirmedBookings, 0);

    const site = instance.location ?? instance.classSchedule?.location ?? null;
    const resolvedLocation = site?.isActive ? site : null;

    if (requestedLocation && resolvedLocation?.id !== requestedLocation.id) {
      return null;
    }

    return {
      instanceId: instance.id,
      startsAt: instance.date,
      endsAt: instance.endsAt,
      schedule: {
        id: instance.classSchedule?.id,
        name: instance.classSchedule?.name,
        description: instance.classSchedule?.description ?? null,
        dayOfWeek: instance.classSchedule?.dayOfWeek ?? null,
        startTime: instance.classSchedule?.startTime ?? null,
        endTime: instance.classSchedule?.endTime ?? null,
      },
      instructor: instance.instructor?.user
        ? {
            id: instance.instructor.user.id,
            name: instance.instructor.user.name,
            email: undefined,
          }
        : null,
      location: resolvedLocation
        ? {
            id: resolvedLocation.id,
            name: resolvedLocation.name,
            address: resolvedLocation.address,
            phone: resolvedLocation.phone,
          }
        : null,
      availability: {
        maxCapacity,
        confirmedBookings,
        waitlistCount,
        spotsRemaining,
        state: spotsRemaining > 0 ? 'open' : 'waitlist',
      },
      bookingPolicy: {
        requiresActiveMember: true,
        supportsWaitlist: true,
        source: 'openfront-gym',
      },
    };
  })
    .filter(Boolean);
}

async function resolveMemberFromDiscoveryIdentity(context: any, identity: {
  organizationId: string;
  memberId?: string | null;
  memberEmail?: string | null;
}) {
  const ctx = context.sudo();

  if (identity.memberId) {
    const [member] = await ctx.query.Member.findMany({
      where: { AND: [{ organization: { id: { equals: identity.organizationId } } }, { id: { equals: identity.memberId } }] },
      take: 1,
      query: 'id email status organization { id } user { id membership { id status classCreditsRemaining } }',
    });
    return member as any;
  }

  if (identity.memberEmail) {
    const members = await ctx.query.Member.findMany({
      where: {
        AND: [
          { organization: { id: { equals: identity.organizationId } } },
          { OR: [
          { email: { equals: identity.memberEmail } },
          { user: { email: { equals: identity.memberEmail } } },
          ] },
        ],
      },
      take: 1,
      query: 'id email status organization { id } user { id membership { id status classCreditsRemaining } }',
    });
    return (members[0] as any) ?? null;
  }

  return null;
}

async function createDiscoveryBooking(context: any, input: {
  organizationId: string;
  classInstanceId: string;
  memberId?: string | null;
  memberEmail?: string | null;
}) {
  const ctx = context.sudo();
  const member = await resolveMemberFromDiscoveryIdentity(context, {
    organizationId: input.organizationId,
    memberId: input.memberId,
    memberEmail: input.memberEmail,
  });

  if (!member) {
    throw new Error('No member matched the discovery booking identity.');
  }

  if (member.status !== 'active') {
    throw new Error(`Member status is ${member.status}.`);
  }

  if (member.user?.membership?.status !== 'active') {
    throw new Error('Member does not have an active membership.');
  }

  const existing = await ctx.query.ClassBooking.findMany({
    where: {
      AND: [
        { organization: { id: { equals: input.organizationId } } },
        { member: { id: { equals: member.id } } },
        { classInstance: { id: { equals: input.classInstanceId } } },
        { status: { in: ["confirmed", "waitlist"] } },
      ],
    },
    take: 1,
    query: "id status waitlistPosition",
  });
  if (existing[0]) {
    return {
      bookingId: (existing[0] as any).id,
      bookingStatus: (existing[0] as any).status,
      waitlistPosition: (existing[0] as any).waitlistPosition ?? null,
      creditsRemaining: member.user.membership.classCreditsRemaining,
      memberId: member.id,
      reused: true,
    };
  }

  const result = await createCapacityControlledBooking(ctx.prisma, {
    classInstanceId: input.classInstanceId,
    memberId: member.id,
    actorUserId: member.user.id,
    actorOrganizationId: input.organizationId,
    actorCanManageAllRecords: true,
    capacityMode: 'waitlist',
  });

  return {
    bookingId: result.bookingId,
    bookingStatus: result.status,
    waitlistPosition: result.waitlistPosition ?? null,
    creditsRemaining: result.creditsRemaining,
    memberId: member.id,
    reused: false,
  };
}

async function authorizeDiscovery(
  context: any,
  credential: string,
  partner: string,
  requiredScope: "classes:read" | "bookings:create",
) {
  // Invalid credentials spend a per-source failure budget; valid partners have their own budgets.
  // An unknown source would be one shared bucket, so only known sources carry a failure budget.
  const source = requestClientSource(context.req);
  const failureBudget = isKnownSource(source) ? budgetKey("discovery-fail", source) : "";
  if (failureBudget && !(await reserveAuthAttempt(context.prisma, failureBudget, 100, 60 * 1000))) throw new Error('Too many failed discovery authentication attempts');
  // The reservation is kept for a rejected credential and given back for a valid one.
  const rejectCredential = async (message: string) => {
    throw new Error(message);
  };
  const accepted = async () => { if (failureBudget) await releaseAuthAttempt(context.prisma, failureBudget); };
  if (credential.startsWith('gym_')) {
    const digest = createHash('sha256').update(credential).digest('hex');
    const prisma = guardKeystonePrismaResults(context.prisma as any);
    const stored = await prisma.integrationCredential.findUnique({ where: { digest }, include: { organization: true } });
    if (!stored || stored.revokedAt || !stored.expiresAt || stored.expiresAt <= new Date() || stored.organization?.status !== 'active') return rejectCredential('Unauthorized discovery request');
    await accepted();
    if (stored.partner !== partner.trim() || !Array.isArray(stored.scopes) || !stored.scopes.includes(requiredScope)) throw new Error('Unauthorized discovery scope or partner');
    if (!(await consumeAuthAttempt(context.prisma, budgetKey("discovery-key", stored.id), 120, 60 * 1000))) throw new Error('Too many discovery requests');
    return { organizationId: stored.organizationId, partner: stored.partner, mode: 'managed-key' };
  }
  const configuredKey = process.env.DISCOVERY_API_KEY?.trim();
  const organizationId = process.env.DISCOVERY_ORGANIZATION_ID?.trim();
  if (!configuredKey || configuredKey.length < 32 || !organizationId) {
    throw new GraphQLError("Discovery API is not configured", {
      extensions: {
        code: "DISCOVERY_NOT_CONFIGURED",
        http: { status: 503 },
      },
    });
  }
  const scopes = new Set((process.env.DISCOVERY_API_SCOPES || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (!scopes.has(requiredScope)) throw new Error(`Discovery credential is missing required scope: ${requiredScope}`);
  const normalizedPartner = partner.trim().slice(0, 120) || "authorized-partner";
  const allowlist = new Set((process.env.DISCOVERY_PARTNER_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (allowlist.size && !allowlist.has(normalizedPartner)) throw new Error("Discovery partner is not authorized");
  const supplied = Buffer.from(credential || "");
  const configured = Buffer.from(configuredKey);
  if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) {
    return rejectCredential("Unauthorized discovery request");
  }
  await accepted();
  if (!(await consumeAuthAttempt(context.prisma, budgetKey("discovery", normalizedPartner), 120, 60 * 1000))) {
    throw new Error("Too many discovery requests");
  }
  const organization = await context.sudo().query.Organization.findMany({
    where: { AND: [{ id: { equals: organizationId } }, { status: { equals: "active" } }] },
    take: 1,
    query: "id",
  });
  if (!organization[0]) throw new Error("Discovery organization is not active");
  return { organizationId, partner: normalizedPartner, mode: "key-authenticated" };
}

export async function getDiscoveryClasses(
  _root: unknown,
  args: {
    credential: string;
    partner?: string | null;
    from?: string | null;
    to?: string | null;
    dayOfWeek?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    limit?: number | null;
    skip?: number | null;
  },
  context: any,
) {
  const access = await authorizeDiscovery(context, args.credential, args.partner || "", "classes:read");
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const skip = Math.min(Math.max(Math.trunc(args.skip ?? 0), 0), 5000);
  // One extra row tells the partner honestly whether another page exists.
  const page = await getDiscoveryClassFeed(context, {
    organizationId: access.organizationId,
    from: args.from,
    to: args.to,
    dayOfWeek: args.dayOfWeek,
    locationId: args.locationId,
    locationName: args.locationName,
    limit: limit + 1,
    skip,
  });
  const classes = page.slice(0, limit);
  return { source: "openfront-gym", ...access, count: classes.length, skip, limit, hasMore: page.length > limit, nextSkip: page.length > limit ? skip + limit : null, classes };
}

export async function bookDiscoveryClass(
  _root: unknown,
  args: {
    credential: string;
    partner?: string | null;
    classInstanceId: string;
    memberId?: string | null;
    memberEmail?: string | null;
  },
  context: any,
) {
  const access = await authorizeDiscovery(context, args.credential, args.partner || "", "bookings:create");
  const classInstanceId = args.classInstanceId.trim();
  const memberId = args.memberId?.trim() || null;
  const memberEmail = args.memberEmail?.trim().toLowerCase() || null;
  if (!classInstanceId || classInstanceId.length > 200 || (!memberId && !memberEmail) || (memberId?.length || 0) > 200 || (memberEmail?.length || 0) > 254) {
    throw new Error("Discovery booking request is invalid");
  }
  const booking = await createDiscoveryBooking(context, {
    organizationId: access.organizationId,
    classInstanceId,
    memberId,
    memberEmail,
  });
  return { success: true, ...access, booking };
}
