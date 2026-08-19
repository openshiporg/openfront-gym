"use client";

import { cancelBookingAction } from "@/features/storefront/lib/actions/bookings";

export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  return (
    <form
      action={cancelBookingAction}
      onSubmit={(event) => {
        if (!window.confirm("Cancel this booking? A confirmed spot may be offered to the next eligible waitlisted member.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <button type="submit" className="sf-btn-secondary px-4 py-2 text-xs">
        Cancel booking
      </button>
    </form>
  );
}
