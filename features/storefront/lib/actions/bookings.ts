"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const bookingId = formData.get("bookingId")?.toString();
  if (!bookingId) throw new Error("Missing booking id.");

  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) {
    throw new Error("Please sign in to cancel a booking.");
  }
  try {
    await gymClient.request(
      gql`
        mutation CancelClassBooking($bookingId: ID!) {
          cancelClassBooking(bookingId: $bookingId) {
            booking { id classInstance { id } }
            promoted
            message
          }
        }
      `,
      { bookingId },
      headers
    );
  } catch {
    redirect("/account/bookings?error=Unable%20to%20cancel%20this%20booking");
  }

  revalidatePath("/account/bookings");
  revalidatePath("/account");
  revalidatePath("/dashboard/platform/rosters");
  redirect("/account/bookings?notice=Booking%20cancelled");
}
