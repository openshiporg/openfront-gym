"use server";

import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";
import { keystoneContext } from "@/features/keystone/context";

export type BookClassResult =
  | { success: true; bookingId: string; creditsRemaining: number }
  | { success: false; error: string };

/**
 * Book a class instance for the authenticated user.
 * Looks up the Member record via User.id first (Member → user relation).
 */
export async function bookClass(classInstanceId: string): Promise<BookClassResult> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) {
      return { success: false, error: "Not logged in. Please sign in to book a class." };
    }

    // Resolve User.id from session
    const { authenticatedItem } = await gymClient.request<any>(
      gql`query { authenticatedItem { ... on User { id } } }`,
      {},
      headers
    );
    const userId: string | undefined = authenticatedItem?.id;
    if (!userId) return { success: false, error: "Session expired. Please sign in again." };

    // Look up Member record for this user
    const ctx = keystoneContext.sudo();
    const members = await ctx.query.Member.findMany({
      where: { user: { id: { equals: userId } } },
      query: "id",
      take: 1,
    });
    if (!members.length) {
      return { success: false, error: "No member profile found. Please complete your signup." };
    }
    const memberId = (members[0] as any).id;

    // Call the bookClass mutation
    const result = await gymClient.request<any>(
      gql`
        mutation BookClass($classInstanceId: ID!, $memberId: ID!) {
          bookClass(classInstanceId: $classInstanceId, memberId: $memberId) {
            booking { id }
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
      creditsRemaining: result.bookClass.creditsRemaining,
    };
  } catch (e: any) {
    const msg = e?.response?.errors?.[0]?.message ?? e?.message ?? "Booking failed";
    return { success: false, error: msg };
  }
}
