"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const bookingId = formData.get("bookingId")?.toString();
  if (!bookingId) redirect("/account/bookings?error=Choose%20a%20booking%20to%20cancel");

  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) {
    redirect("/account?returnTo=%2Faccount%2Fbookings");
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

  revalidatePath("/schedule");
  revalidatePath("/account/bookings");
  revalidatePath("/account");
  revalidatePath("/dashboard/platform/rosters");
  redirect("/account/bookings?notice=Booking%20cancelled");
}
