import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "./cookies";

const BOOKING_FIELDS = gql`
  fragment StorefrontBooking on ClassBooking {
    id status waitlistPosition bookedAt cancelledAt eligibilityReviewReason serviceSnapshot
    classInstance {
      id date endsAt isCancelled amendments
      location { name }
      classSchedule { name startTime endTime location { name } instructor { displayName } }
      instructor { displayName }
    }
  }
`;

async function bookings(where: Record<string, unknown>, orderBy: Array<Record<string, string>>, take: number, skip = 0) {
  const result = await gymClient.request<{ classBookings: any[] }>(gql`
    ${BOOKING_FIELDS}
    query StorefrontBookings($where: ClassBookingWhereInput!, $orderBy: [ClassBookingOrderByInput!]!, $take: Int!, $skip: Int!) {
      classBookings(where: $where, orderBy: $orderBy, take: $take, skip: $skip) { ...StorefrontBooking }
    }
  `, { where, orderBy, take, skip }, await getAuthHeaders());
  return result.classBookings;
}

export const BOOKING_HISTORY_PAGE_SIZE = 20;
export const UPCOMING_PAGE_SIZE = 20;

/**
 * One page of the member's confirmed or waitlisted upcoming bookings in session-date order, with
 * the total, so every upcoming booking is reachable however many there are. `before` limits the
 * page to sessions starting before that time (the schedule's window).
 */
export async function getUpcomingBookingPage(status: "confirmed" | "waitlist", page = 1, options: { pageSize?: number; before?: string } = {}) {
  const headers = await getAuthHeaders();
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? UPCOMING_PAGE_SIZE), 1), 50);
  const requested = Math.max(1, Math.trunc(page) || 1);
  const read = async (current: number) => (await gymClient.request<{ myUpcomingBookingPage: { ids: string[]; total: number } }>(gql`
    query StorefrontUpcomingBookingPage($status: String!, $skip: Int!, $take: Int!, $before: DateTime) {
      myUpcomingBookingPage(status: $status, skip: $skip, take: $take, before: $before)
    }
  `, { status, skip: (current - 1) * pageSize, take: pageSize, before: options.before ?? null }, headers)).myUpcomingBookingPage;
  let result = await read(requested);
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const current = Math.min(requested, pages);
  if (current !== requested) result = await read(current);
  const rows = result.ids.length ? await bookings({ id: { in: result.ids } }, [{ id: "asc" }], result.ids.length) : [];
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  return { items: result.ids.map((id) => byId.get(id)).filter(Boolean) as any[], total: result.total, page: current, pages };
}

/** Every upcoming confirmed and waitlisted booking for sessions starting before `before`, in date order. */
export async function getUpcomingBookingsBefore(before: string) {
  const all: any[] = [];
  for (const status of ["confirmed", "waitlist"] as const) {
    for (let page = 1; ; page += 1) {
      const result = await getUpcomingBookingPage(status, page, { pageSize: 50, before });
      all.push(...result.items);
      if (page >= result.pages || page >= 20) break;
    }
  }
  return all;
}

/** One page of the member's own booking history, newest first, with the total for paging. */
export async function getBookingHistory(userId: string, organizationId: string, page = 1) {
  const where = {
    organization: { id: { equals: organizationId } },
    member: { user: { id: { equals: userId } } },
    OR: [
      { status: { equals: "cancelled" } },
      { classInstance: { isCancelled: { equals: true } } },
      { classInstance: { date: { lt: new Date().toISOString() } } },
    ],
  };
  const { classBookingsCount: total } = await gymClient.request<{ classBookingsCount: number }>(gql`
    query StorefrontBookingHistoryCount($where: ClassBookingWhereInput!) { classBookingsCount(where: $where) }
  `, { where }, await getAuthHeaders());
  const pages = Math.max(1, Math.ceil(total / BOOKING_HISTORY_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const items = await bookings(where, [{ bookedAt: "desc" }, { id: "asc" }], BOOKING_HISTORY_PAGE_SIZE, (current - 1) * BOOKING_HISTORY_PAGE_SIZE);
  return { items, total, page: current, pages };
}

export async function getUserBookings(userId: string, organizationId: string) {
  return bookings({
    organization: { id: { equals: organizationId } },
    member: { user: { id: { equals: userId } } },
  }, [{ bookedAt: "desc" }], 100);
}
