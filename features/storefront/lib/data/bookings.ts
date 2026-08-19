import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "./cookies";

const BOOKING_FIELDS = gql`
  fragment StorefrontBooking on ClassBooking {
    id status waitlistPosition bookedAt cancelledAt
    classInstance {
      id date
      classSchedule { name startTime endTime }
      instructor { user { name } }
    }
  }
`;

async function bookings(where: Record<string, unknown>, orderBy: Array<Record<string, string>>, take: number) {
  const result = await gymClient.request<{ classBookings: any[] }>(gql`
    ${BOOKING_FIELDS}
    query StorefrontBookings($where: ClassBookingWhereInput!, $orderBy: [ClassBookingOrderByInput!]!, $take: Int!) {
      classBookings(where: $where, orderBy: $orderBy, take: $take) { ...StorefrontBooking }
    }
  `, { where, orderBy, take }, await getAuthHeaders());
  return result.classBookings;
}

export async function getUpcomingBookings(userId: string, organizationId: string) {
  return bookings({
    organization: { id: { equals: organizationId } },
    member: { user: { id: { equals: userId } } },
    status: { in: ["confirmed", "waitlist"] },
    classInstance: { date: { gte: new Date().toISOString() }, isCancelled: { equals: false } },
  }, [{ bookedAt: "asc" }], 100);
}

export async function getBookingHistory(userId: string, organizationId: string) {
  return bookings({
    organization: { id: { equals: organizationId } },
    member: { user: { id: { equals: userId } } },
    OR: [
      { status: { equals: "cancelled" } },
      { classInstance: { date: { lt: new Date().toISOString() } } },
    ],
  }, [{ bookedAt: "desc" }], 20);
}

export async function getUserBookings(userId: string, organizationId: string) {
  return bookings({
    organization: { id: { equals: organizationId } },
    member: { user: { id: { equals: userId } } },
  }, [{ bookedAt: "desc" }], 100);
}
