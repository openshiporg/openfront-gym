"use client";
import { useState } from "react";
import { cancelBookingAction } from "@/features/storefront/lib/actions/bookings";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import SubmitButton from "@/features/storefront/modules/common/submit-button";
export function CancelBookingForm({ bookingId, sessionName = "this class", waitlist = false }: { bookingId: string; sessionName?: string; waitlist?: boolean }) {
  const [open, setOpen] = useState(false);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><button type="button" className="sf-btn-secondary">{waitlist ? "Leave waitlist" : "Cancel booking"}</button></AlertDialogTrigger><AlertDialogContent className="sf-booking-dialog"><AlertDialogHeader><AlertDialogTitle>{waitlist ? "Leave the waitlist?" : "Cancel your booking?"}</AlertDialogTitle><AlertDialogDescription>{sessionName}. {waitlist ? "You will lose your place in this queue." : "Your space may be offered to another member. Any eligible credit returns to its original allowance and expiry."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep {waitlist ? "waitlist place" : "booking"}</AlertDialogCancel><form action={cancelBookingAction}><input type="hidden" name="bookingId" value={bookingId} /><SubmitButton pendingLabel="Cancelling…">{waitlist ? "Leave waitlist" : "Confirm cancellation"}</SubmitButton></form></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
