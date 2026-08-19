import { timingSafeEqual } from "node:crypto";
import { consumeAuthAttempt } from "../../../lib/authRateLimit";
import { createCapacityControlledBooking } from "./classCapacity";

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

function parseDiscoveryLocationTag(description?: string | null) {
  const match = description?.match(/\[(?:location|facility):\s*([^\]]+)\]/i);
  return match?.[1]?.trim() || null;
}

async function getDiscoveryClassFeed(context: any, options: {
  organizationId: string;
  from?: string | null;
  to?: string | null;
  dayOfWeek?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  limit?: number;
}) {
  const ctx = context.sudo();
  const { from, to } = resolveWindow(options?.from, options?.to);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

  const instances = await ctx.query.ClassInstance.findMany({
    where: {
      organization: { id: { equals: options.organizationId } },
      date: { gte: from, lte: to },
      isCancelled: { equals: false },
      ...(options?.dayOfWeek
        ? { classSchedule: { dayOfWeek: { equals: options.dayOfWeek } } }
        : {}),
    },
    orderBy: [{ date: 'asc' }],
    take: limit,
    query: `
      id
      date
      maxCapacity
      classSchedule {
        id
        name
        description
        dayOfWeek
        startTime
        endTime
        maxCapacity
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

  const defaultLocation = requestedLocation ?? activeLocations[0] ?? null;

  return instances
    .map((instance: any) => {
    const confirmedBookings = (instance.bookings ?? []).filter((booking: any) => booking.status === 'confirmed').length;
    const waitlistCount = (instance.bookings ?? []).filter((booking: any) => booking.status === 'waitlist').length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    const spotsRemaining = Math.max(maxCapacity - confirmedBookings, 0);

    const taggedLocationName = parseDiscoveryLocationTag(instance.classSchedule?.description);
    const taggedLocation = taggedLocationName
      ? activeLocations.find((location: any) => normalizeLocationName(location.name) === normalizeLocationName(taggedLocationName)) ?? null
      : null;
    const resolvedLocation = requestedLocation ?? taggedLocation ?? defaultLocation;

    if (requestedLocation && resolvedLocation?.id !== requestedLocation.id) {
      return null;
    }

    return {
      instanceId: instance.id,
      startsAt: instance.date,
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
  const configuredKey = process.env.DISCOVERY_API_KEY?.trim();
  const organizationId = process.env.DISCOVERY_ORGANIZATION_ID?.trim();
  if (!configuredKey || configuredKey.length < 32 || !organizationId) throw new Error("Discovery API is not configured");
  const scopes = new Set((process.env.DISCOVERY_API_SCOPES || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (!scopes.has(requiredScope)) throw new Error(`Discovery credential is missing required scope: ${requiredScope}`);
  const normalizedPartner = partner.trim().slice(0, 120) || "authorized-partner";
  const allowlist = new Set((process.env.DISCOVERY_PARTNER_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (allowlist.size && !allowlist.has(normalizedPartner)) throw new Error("Discovery partner is not authorized");
  if (!(await consumeAuthAttempt(context.prisma, "discovery-auth:global", 1000, 60 * 1000))) {
    throw new Error("Too many discovery authentication attempts");
  }
  const supplied = Buffer.from(credential || "");
  const configured = Buffer.from(configuredKey);
  if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) {
    throw new Error("Unauthorized discovery request");
  }
  if (!(await consumeAuthAttempt(context.prisma, `discovery:${normalizedPartner}`, 120, 60 * 1000))) {
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
  },
  context: any,
) {
  const access = await authorizeDiscovery(context, args.credential, args.partner || "", "classes:read");
  const classes = await getDiscoveryClassFeed(context, {
    organizationId: access.organizationId,
    from: args.from,
    to: args.to,
    dayOfWeek: args.dayOfWeek,
    locationId: args.locationId,
    locationName: args.locationName,
    limit: args.limit ?? undefined,
  });
  return { source: "openfront-gym", ...access, count: classes.length, classes };
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
