import { currentRoleActor } from "../access/currentRoleActor";
import { localDateStart, nextDateKey, resolveGymTimeZone } from "../../../lib/timezone";

function rosterActor(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  const isInstructor = Boolean(session?.data?.role?.isInstructor);
  const canManageAllRecords = Boolean(session?.data?.role?.canManageAllRecords);
  if (!session?.itemId || !organizationId || !session.data?.role?.canAccessDashboard || (!isInstructor && !canManageAllRecords)) {
    throw new Error("Roster dashboard access required");
  }
  return {
    userId: session.itemId as string,
    organizationId: organizationId as string,
    instructorOnly: isInstructor && !canManageAllRecords,
  };
}

/** An instructor-only actor must still be an active coach in this tenant to see rosters. */
async function assertActiveInstructor(context: any, actor: { userId: string; organizationId: string; instructorOnly: boolean }) {
  if (!actor.instructorOnly) return;
  const active = await context.sudo().query.Instructor.count({ where: { AND: [
    { organization: { id: { equals: actor.organizationId } } },
    { user: { id: { equals: actor.userId } } },
    { isActive: { equals: true } },
  ] } });
  if (!active) throw new Error("Roster access requires an active instructor profile");
}

function assignmentFilter(userId: string) {
  return { OR: [
    { instructor: { user: { id: { equals: userId } } } },
    { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { id: { equals: userId } } } } }] },
  ] };
}

export const ROSTER_GYM_SETTINGS_PROJECTION = "name address timezone";
export const ROSTER_ORGANIZATION_PROJECTION = "name timezone";
export const ROSTER_LOCATION_PROJECTION = "id name address";
export const ROSTER_SESSION_PROJECTION = `
  id date maxCapacity isCancelled
  bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } })
  waitlistCount: bookingsCount(where: { status: { equals: "waitlist" } })
  location { id name address }
  classSchedule { id name maxCapacity startTime endTime instructor { user { name } } location { id name address } }
  instructor { user { name } }
`;
export const ROSTER_DETAIL_PROJECTION = `
  id date maxCapacity isCancelled cancellationReason
  location { id name address }
  classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name email } } location { id name address } }
  instructor { id user { name email } }
`;
const ROSTER_BOOKING_PROJECTION = `
  id status eligibilityReviewReason bookedAt waitlistPosition memberName memberEmail memberPhone
  member { id name email phone user { id } }
`;
export const ROSTER_ATTENDANCE_PROJECTION =
  "id booking { id } attended lateArrival minutesLate noShowReason markedAt";

export function rosterInstructorAccountProjection(from: string) {
  const boundedFrom = JSON.stringify(from);
  return `
    id specialties certifications
    classSchedules(take: 30) {
      id name dayOfWeek startTime endTime maxCapacity
      instances(
        where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false }, instructor: null }
        orderBy: [{ date: asc }]
        take: 20
      ) { id date maxCapacity instructor { id } bookings { id status waitlistPosition } }
    }
    classInstances(
      where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false } }
      orderBy: [{ date: asc }]
      take: 20
    ) {
      id date maxCapacity instructor { id }
      classSchedule { id name maxCapacity dayOfWeek startTime endTime }
      bookings { id status waitlistPosition }
    }
  `;
}

async function getRosterPresentation(context: any, organizationId: string) {
  const sudo = context.sudo();
  const [settings, organizations] = await Promise.all([
    sudo.query.GymSettings.findMany({
      where: { organization: { id: { equals: organizationId } } },
      take: 1,
      query: ROSTER_GYM_SETTINGS_PROJECTION,
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: organizationId } },
      take: 1,
      query: ROSTER_ORGANIZATION_PROJECTION,
    }),
  ]);
  const gym = settings[0] as any;
  const organization = organizations[0] as any;
  return { gymTimezone: resolveGymTimeZone(gym?.timezone, organization?.timezone) };
}

/** A session's own place: the occurrence override, else its template's location; never another site. */
function withEffectiveLocation(session: any) {
  const location = session.location || session.classSchedule?.location || null;
  return { ...session, effectiveLocation: location ? { id: location.id, name: location.name, address: location.address || null } : null };
}

/**
 * The signed-in coach's own teaching calendar for the storefront account page. It needs the
 * current instructor role and an active instructor profile in this tenant, not dashboard access.
 */
export async function getInstructorAccount(_root: unknown, _args: unknown, context: any) {
  const current = await currentRoleActor(context);
  if (!current.isInstructor) throw new Error("Instructor access required");
  const actor = { userId: current.userId, organizationId: current.organizationId };
  const instructors = await context.sudo().query.Instructor.findMany({
    where: {
      AND: [
        { organization: { id: { equals: actor.organizationId } } },
        { user: { id: { equals: actor.userId } } },
        { isActive: { equals: true } },
      ],
    },
    take: 1,
    query: rosterInstructorAccountProjection(new Date().toISOString()),
  });
  return (instructors[0] as any) ?? null;
}

const ROSTER_PAGE_SIZE = 25;
// Seat-dependent states read every matching future session in batches of this size, up to the
// safety bound below; the result says honestly if that bound was ever reached.
const ROSTER_SCAN_BATCH = 1000;
const ROSTER_SCAN_MAX = 50_000;
const ROSTER_STATES = ["all", "upcoming", "full", "started", "cancelled"] as const;
const ROSTER_SORTS = ["soonest", "latest", "fullest"] as const;

/**
 * A local calendar date's bound in the gym's zone: its first instant, or (for an inclusive end
 * date) the first instant of the next local date. Days are 23, 24 or 25 hours; a date whose
 * midnight is skipped starts at its first real minute. Malformed or impossible dates are refused.
 */
function localDayBound(value: unknown, timeZone: string, endOfDay: boolean) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a date like 2027-03-14");
  try {
    return localDateStart(endOfDay ? nextDateKey(value) : value, timeZone);
  } catch {
    throw new Error("Choose a real calendar date");
  }
}

function sessionCapacity(session: any) {
  return session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
}

/**
 * Roster queue with server-side search (class, coach, location), state, local date range, order
 * and paging. Full, upcoming and fullest-first depend on live seat counts: every matching future
 * session is classified (read in batches), so totals, ordering and pages cover the whole scope.
 */
export async function getRosterSessions(
  _root: unknown,
  args: { q?: string | null; state?: string | null; from?: string | null; to?: string | null; sort?: string | null; skip?: number | null },
  context: any,
) {
  const actor = rosterActor(context);
  await assertActiveInstructor(context, actor);
  const presentation = await getRosterPresentation(context, actor.organizationId);
  const timeZone = presentation.gymTimezone;
  const state = (ROSTER_STATES as readonly string[]).includes(args.state || "") ? args.state as (typeof ROSTER_STATES)[number] : "all";
  const sort = (ROSTER_SORTS as readonly string[]).includes(args.sort || "") ? args.sort as (typeof ROSTER_SORTS)[number] : "soonest";
  const q = String(args.q || "").trim().slice(0, 100);
  const requestedSkip = Number.isSafeInteger(args.skip) ? Math.min(Math.max(0, args.skip as number), 1_000_000) : 0;
  const now = new Date();
  const from = localDayBound(args.from, timeZone, false) || new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = localDayBound(args.to, timeZone, true);
  if (to && to <= from) throw new Error("The end date must be on or after the start date");
  const text = (path: (value: any) => any) => path({ contains: q, mode: "insensitive" });
  const base: any[] = [
    { organization: { id: { equals: actor.organizationId } } },
    { date: { gte: from.toISOString() } },
    ...(to ? [{ date: { lt: to.toISOString() } }] : []),
    ...(actor.instructorOnly ? [assignmentFilter(actor.userId)] : []),
    ...(q ? [{ OR: [
      text((match) => ({ classSchedule: { name: match } })),
      text((match) => ({ instructor: { user: { name: match } } })),
      text((match) => ({ AND: [{ instructor: null }, { classSchedule: { instructor: { user: { name: match } } } }] })),
      text((match) => ({ location: { name: match } })),
      text((match) => ({ AND: [{ location: null }, { classSchedule: { location: { name: match } } }] })),
    ] }] : []),
  ];
  const nowIso = now.toISOString();
  const stateWhere: Record<string, any[]> = {
    all: [],
    cancelled: [{ isCancelled: { equals: true } }],
    started: [{ isCancelled: { equals: false } }, { date: { lte: nowIso } }],
    future: [{ isCancelled: { equals: false } }, { date: { gt: nowIso } }],
  };
  const sudo = context.sudo();
  const count = (extra: any[]) => sudo.query.ClassInstance.count({ where: { AND: [...base, ...extra] } });
  const [allCount, cancelledCount, startedCount, futureCount] = await Promise.all([
    count(stateWhere.all), count(stateWhere.cancelled), count(stateWhere.started), count(stateWhere.future),
  ]);

  const isFull = (session: any) => sessionCapacity(session) > 0 && (session.bookingsCount ?? 0) >= sessionCapacity(session);
  const fill = (session: any) => (session.bookingsCount ?? 0) / Math.max(sessionCapacity(session), 1);
  const order = [{ date: sort === "latest" ? "desc" : "asc" }, { id: "asc" }];
  // Every session in a scope, in light batches: id, date, seats and capacity only.
  const scanAll = async (extra: any[]) => {
    const rows: any[] = [];
    for (let offset = 0; offset < ROSTER_SCAN_MAX; offset += ROSTER_SCAN_BATCH) {
      const batch = await sudo.query.ClassInstance.findMany({
        where: { AND: [...base, ...extra] }, orderBy: order, skip: offset, take: ROSTER_SCAN_BATCH,
        query: 'id date maxCapacity bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) classSchedule { maxCapacity }',
      });
      rows.push(...batch);
      if (batch.length < ROSTER_SCAN_BATCH) return { rows, complete: true };
    }
    return { rows, complete: false };
  };
  const classify = state === "upcoming" || state === "full";
  const scanWhere = classify ? stateWhere.future : stateWhere[state];
  let scanLimited = false;
  let fullCount: number | null = null;
  // Exact full/upcoming totals for the whole future scope.
  const future = futureCount <= ROSTER_SCAN_MAX ? await scanAll(stateWhere.future) : { rows: [], complete: false };
  if (future.complete) fullCount = future.rows.filter(isFull).length; else scanLimited = true;
  let total: number;
  let matches: any[] | null = null;
  if (classify || sort === "fullest") {
    const scope = classify ? future : await scanAll(scanWhere);
    if (!scope.complete) scanLimited = true;
    matches = scope.rows;
    if (classify) matches = matches.filter((session) => (state === "full") === isFull(session));
    if (sort === "fullest") matches = [...matches].sort((a, b) => fill(b) - fill(a) || String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    total = matches.length;
  } else {
    total = state === "all" ? allCount : state === "cancelled" ? cancelledCount : startedCount;
  }
  // An offset past the end shows the last page rather than an empty range.
  const skip = total > 0 ? Math.min(requestedSkip, Math.floor((total - 1) / ROSTER_PAGE_SIZE) * ROSTER_PAGE_SIZE) : 0;
  const pageIds = matches ? matches.slice(skip, skip + ROSTER_PAGE_SIZE).map((session) => session.id) : null;
  let sessions: any[];
  if (pageIds) {
    const rows = pageIds.length ? await sudo.query.ClassInstance.findMany({ where: { id: { in: pageIds } }, take: pageIds.length, query: ROSTER_SESSION_PROJECTION }) : [];
    const byId = new Map((rows as any[]).map((row) => [row.id, row]));
    sessions = pageIds.map((id) => byId.get(id)).filter(Boolean);
  } else {
    sessions = await sudo.query.ClassInstance.findMany({
      where: { AND: [...base, ...scanWhere] },
      orderBy: order,
      skip,
      take: ROSTER_PAGE_SIZE,
      query: ROSTER_SESSION_PROJECTION,
    });
  }
  return {
    sessions: sessions.map((session) => ({ ...withEffectiveLocation(session), ...presentation })),
    total,
    skip,
    pageSize: ROSTER_PAGE_SIZE,
    scanLimited,
    timeZone,
    window: { from: from.toISOString(), to: to?.toISOString() ?? null },
    counts: {
      all: allCount,
      cancelled: cancelledCount,
      started: startedCount,
      full: fullCount,
      upcoming: fullCount === null ? null : futureCount - fullCount,
    },
  };
}

const ROSTER_DETAIL_PAGE = 200;

/**
 * One session's roster. Confirmed, waitlisted and other bookings are paged independently, and
 * seat, waitlist and attendance totals are counted over every booking, so a session of any
 * capacity is fully reachable and its open seats are never derived from a partial list.
 */
export async function getRosterDetail(
  _root: unknown,
  { classInstanceId, confirmedSkip = 0, waitlistSkip = 0, otherSkip = 0 }: { classInstanceId: string; confirmedSkip?: number | null; waitlistSkip?: number | null; otherSkip?: number | null },
  context: any,
) {
  const actor = rosterActor(context);
  await assertActiveInstructor(context, actor);
  const where = {
    AND: [
      { id: { equals: classInstanceId } },
      { organization: { id: { equals: actor.organizationId } } },
      ...(actor.instructorOnly ? [assignmentFilter(actor.userId)] : []),
    ],
  };
  const [instances, presentation] = await Promise.all([
    context.sudo().query.ClassInstance.findMany({
      where,
      take: 1,
      query: ROSTER_DETAIL_PROJECTION,
    }),
    getRosterPresentation(context, actor.organizationId),
  ]);
  const instance = instances[0] as any;
  if (!instance) return null;
  const sudo = context.sudo();
  const inSession = [{ classInstance: { id: { equals: instance.id } } }, { organization: { id: { equals: actor.organizationId } } }];
  const groups = {
    confirmed: [{ status: { equals: "confirmed" } }],
    waitlist: [{ status: { equals: "waitlist" } }],
    other: [{ status: { notIn: ["confirmed", "waitlist"] } }],
  };
  const page = async (extra: any[], requested: unknown) => {
    const total = await sudo.query.ClassBooking.count({ where: { AND: [...inSession, ...extra] } });
    const asked = Number.isSafeInteger(requested) ? Math.max(0, requested as number) : 0;
    const skip = total > 0 ? Math.min(asked, Math.floor((total - 1) / ROSTER_DETAIL_PAGE) * ROSTER_DETAIL_PAGE) : 0;
    const rows = await sudo.query.ClassBooking.findMany({
      where: { AND: [...inSession, ...extra] },
      orderBy: [{ waitlistPosition: "asc" }, { bookedAt: "asc" }, { id: "asc" }],
      skip, take: ROSTER_DETAIL_PAGE, query: ROSTER_BOOKING_PROJECTION,
    });
    return { rows: rows as any[], total, skip, pageSize: ROSTER_DETAIL_PAGE };
  };
  const confirmedAttendance = (extra: any[]) => sudo.query.AttendanceRecord.count({ where: { AND: [
    { organization: { id: { equals: actor.organizationId } } },
    { booking: { AND: [{ classInstance: { id: { equals: instance.id } } }, { status: { equals: "confirmed" } }] } },
    ...extra,
  ] } });
  const [confirmed, waitlist, other, attendedCount, noShowCount] = await Promise.all([
    page(groups.confirmed, confirmedSkip), page(groups.waitlist, waitlistSkip), page(groups.other, otherSkip),
    confirmedAttendance([{ attended: { equals: true } }]), confirmedAttendance([{ attended: { equals: false } }]),
  ]);
  const bookings = [...confirmed.rows, ...waitlist.rows, ...other.rows];
  const bookingIds = bookings.map((booking: any) => booking.id).filter(Boolean);
  const attendanceByBookingId = new Map<string, any>();
  if (bookingIds.length) {
    const records = await context.sudo().query.AttendanceRecord.findMany({
      where: {
        AND: [
          { booking: { id: { in: bookingIds } } },
          { organization: { id: { equals: actor.organizationId } } },
        ],
      },
      take: bookingIds.length,
      query: ROSTER_ATTENDANCE_PROJECTION,
    });
    for (const record of records as any[]) {
      if (!attendanceByBookingId.has(record.booking?.id)) attendanceByBookingId.set(record.booking.id, record);
    }
  }
  const withAttendance = (rows: any[]) => rows.map((booking: any) => ({ ...booking, attendance: attendanceByBookingId.get(booking.id) ?? null }));
  return {
    ...withEffectiveLocation(instance),
    ...presentation,
    bookings: withAttendance(bookings),
    bookingPages: {
      confirmed: { ...confirmed, rows: withAttendance(confirmed.rows) },
      waitlist: { ...waitlist, rows: withAttendance(waitlist.rows) },
      other: { ...other, rows: withAttendance(other.rows) },
    },
    counts: {
      confirmed: confirmed.total, waitlist: waitlist.total, other: other.total,
      attended: attendedCount, noShow: noShowCount, unmarked: Math.max(confirmed.total - attendedCount - noShowCount, 0),
    },
  };
}
