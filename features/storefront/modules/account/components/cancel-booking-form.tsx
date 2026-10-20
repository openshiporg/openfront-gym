"use client";
import { useState } from "react";
import { cancelBookingAction } from "@/features/storefront/lib/actions/bookings";
import { Sheet, SheetClose } from "@/features/storefront/modules/common/sheet";
import SubmitButton from "@/features/storefront/modules/common/submit-button";

export function CancelBookingForm({ bookingId, sessionName = "this class", waitlist = false }: { bookingId: string; sessionName?: string; waitlist?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sf-btn" data-variant="secondary" data-size="sm" onClick={() => setOpen(true)}>
        {waitlist ? "Leave waitlist" : "Cancel"}
        <span className="sr-only"> {sessionName}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} role="alertdialog" title={waitlist ? "Leave the waitlist?" : "Cancel this booking?"} description={sessionName}>
        <p className="sf-sheet-text">{waitlist ? "You lose your place in the queue." : "Your place is released. An eligible credit returns to its original allowance."}</p>
        <form action={cancelBookingAction} className="sf-sheet-actions">
          <input type="hidden" name="bookingId" value={bookingId} />
          <SheetClose asChild>
            <button type="button" className="sf-btn" data-variant="secondary">Keep</button>
          </SheetClose>
          <SubmitButton variant="danger" pendingLabel="Cancelling…">{waitlist ? "Leave waitlist" : "Cancel booking"}</SubmitButton>
        </form>
      </Sheet>
    </>
  );
}
