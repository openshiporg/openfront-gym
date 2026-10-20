"use server";

import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";
import {
  accountSignInPath,
  bookingReturnPath,
  joinPath,
} from "@/features/storefront/lib/return-path";

export type BookClassResult =
  | {
      success: true;
      bookingId: string;
      status: "confirmed" | "waitlist";
      waitlistPosition: number | null;
      creditsRemaining: number;
    }
  | {
      success: false;
      code:
        | "AUTH_REQUIRED"
        | "MEMBER_REQUIRED"
        | "MEMBERSHIP_REQUIRED"
        | "CREDITS_REQUIRED"
        | "ALREADY_BOOKED"
        | "SCHEDULE_CONFLICT"
        | "PARTICIPATION_REQUIRED"
        | "BOOKING_UNAVAILABLE";
      error: string;
      actionHref?: string;
      actionLabel?: string;
    };

function bookingFailure(message: string, classInstanceId: string): BookClassResult {
  const normalized = message.toLowerCase();
  const returnTo = bookingReturnPath(classInstanceId);
  if (normalized.includes("authentication") || normalized.includes("session expired")) {
    return {
      success: false,
      code: "AUTH_REQUIRED",
      error: "Sign in to continue with this class booking.",
      actionHref: accountSignInPath(returnTo),
      actionLabel: process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true" ? "Sign in or create account" : "Sign in",
    };
  }
  if (normalized.includes("no member profile") || normalized.includes("member not linked")) {
    return {
      success: false,
      code: "MEMBER_REQUIRED",
      error: "Choose a membership to finish your member profile, then return to this class.",
      actionHref: joinPath(null, returnTo),
      actionLabel: "Choose membership",
    };
  }
  if (normalized.includes("no active membership")) {
    return {
      success: false,
      code: "MEMBERSHIP_REQUIRED",
      error: "An active membership is required for this class.",
      actionHref: joinPath(null, returnTo),
      actionLabel: "Choose membership",
    };
  }
  if (normalized.includes("no class credits")) {
    return {
      success: false,
      code: "CREDITS_REQUIRED",
      error: "No eligible class credits are available for this session’s date.",
      actionHref: "/account/membership",
      actionLabel: "Review membership",
    };
  }
  if (normalized.includes("already has an active booking")) {
    return {
      success: false,
      code: "ALREADY_BOOKED",
      error: "This class is already in your bookings. Cancel it there if you can’t make it.",
      actionHref: "/account/bookings",
      actionLabel: "Your bookings",
    };
  }
  if (normalized.includes("overlapping class")) {
    return {
      success: false,
      code: "SCHEDULE_CONFLICT",
      error: "You’re already booked into another class at this time. Cancel that booking first to take this one.",
      actionHref: "/account/bookings",
      actionLabel: "Your bookings",
    };
  }
  if (normalized.includes("overlapping training appointment")) {
    return {
      success: false,
      code: "SCHEDULE_CONFLICT",
      error: "You have a personal training appointment at this time.",
      actionHref: "/account/training",
      actionLabel: "Personal training",
    };
  }
  if (normalized.includes("concurrent booking limit")) {
    return {
      success: false,
      code: "SCHEDULE_CONFLICT",
      error: "Your plan’s limit on upcoming bookings is reached. Cancel an upcoming booking to book this class.",
      actionHref: "/account/bookings",
      actionLabel: "Your bookings",
    };
  }
  if (normalized.includes("frozen") || normalized.includes("outside the paid membership period") || normalized.includes("freeze is being finalized")) {
    return {
      success: false,
      code: "MEMBERSHIP_REQUIRED",
      error: "Your membership doesn’t cover this class’s date.",
      actionHref: "/account/membership",
      actionLabel: "Review membership",
    };
  }
  if (normalized.includes("waiver") || normalized.includes("verification is required") || normalized.includes("facility closure")) {
    return {
      success: false,
      code: "PARTICIPATION_REQUIRED",
      error: normalized.includes("facility closure")
        ? "This class can’t be booked while the facility is closed."
        : normalized.includes("waiver")
          ? "Accept the current participation terms before you book."
          : "The club needs to confirm your participation details before you book.",
      actionHref: "/account/participation",
      actionLabel: "Participation",
    };
  }
  if (normalized.includes("has been cancelled") || normalized.includes("past classes")) {
    return {
      success: false,
      code: "BOOKING_UNAVAILABLE",
      error: "This class is no longer open for booking.",
      actionHref: "/schedule",
      actionLabel: "Back to schedule",
    };
  }
  return {
    success: false,
    code: "BOOKING_UNAVAILABLE",
    error: "This booking could not be completed. Refresh the schedule and try another available session.",
  };
}

/**
 * Book a class instance for the authenticated user.
 * Looks up the Member record via User.id first (Member → user relation).
 */
export async function bookClass(classInstanceId: string): Promise<BookClassResult> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) {
      return bookingFailure("Authentication required", classInstanceId);
    }

    // Resolve User.id from session
    const { authenticatedItem } = await gymClient.request<any>(
      gql`query {
        authenticatedItem {
          ... on User {
            id
            organization { id }
            membership {
              status
              classCreditsRemaining
              tier { classCreditsPerMonth }
            }
          }
        }
      }`,
      {},
      headers
    );
    const userId: string | undefined = authenticatedItem?.id;
    const organizationId: string | undefined = authenticatedItem?.organization?.id;
    if (!userId || !organizationId) return bookingFailure("Session expired", classInstanceId);
    const membership = authenticatedItem?.membership;
    if (!membership || membership.status !== "active") {
      if (membership && ["frozen", "past-due"].includes(membership.status)) {
        return { success: false, code: "MEMBERSHIP_REQUIRED", error: "Your membership needs attention before this session can be booked.", actionHref: "/account/membership", actionLabel: "Review your membership" };
      }
      return bookingFailure("No active membership found", classInstanceId);
    }
    // The domain mutation refreshes service-month credits for the session date.
    // A cached balance or today’s tier must not reject a valid booking here.

    // Look up Member record for this user
    const memberResult = await gymClient.request<{ members: Array<{ id: string }> }>(
      gql`
        query BookingMember($userId: ID!, $organizationId: ID!) {
          members(
            where: {
              AND: [
                { user: { id: { equals: $userId } } }
                { organization: { id: { equals: $organizationId } } }
              ]
            }
            take: 1
          ) { id }
        }
      `,
      { userId, organizationId },
      headers,
    );
    const memberId = memberResult.members[0]?.id;
    if (!memberId) return bookingFailure("No member profile found", classInstanceId);

    // Call the bookClass mutation
    const result = await gymClient.request<any>(
      gql`
        mutation BookClass($classInstanceId: ID!, $memberId: ID!) {
          bookClass(classInstanceId: $classInstanceId, memberId: $memberId) {
            booking { id status waitlistPosition }
            creditsRemaining
          }
        }
      `,
      { classInstanceId, memberId },
      headers
    );

    return {
      success: true,
      bookingId: result.bookClass.booking.id,
      status: result.bookClass.booking.status,
      waitlistPosition: result.bookClass.booking.waitlistPosition ?? null,
      creditsRemaining: result.bookClass.creditsRemaining,
    };
  } catch (e: any) {
    const msg = e?.response?.errors?.[0]?.message ?? e?.message ?? "Booking failed";
    return bookingFailure(msg, classInstanceId);
  }
}
