"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldTextarea, FormField } from "@/features/platform/components/platform-ui";
import { cancelPastRosterBooking } from "../actions/rosters";

/**
 * Staff correction for a confirmed booking on a class that already started and was never
 * marked. Credit handling and the member notice match a normal cancel; the reason is kept
 * with the cancellation notice.
 */
export function CancelPastBookingDialog({ bookingId, classInstanceId, memberName }: { bookingId: string; classInstanceId: string; memberName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const ready = reason.trim().length >= 3;

  const submit = () => startTransition(async () => {
    const form = new FormData();
    form.set("bookingId", bookingId);
    form.set("classInstanceId", classInstanceId);
    form.set("reason", reason.trim());
    try {
      await cancelPastRosterBooking(form);
      toast.success(`Booking for ${memberName} cancelled`);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The booking couldn't be cancelled");
    }
  });

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-[34px] w-full text-destructive hover:text-destructive sm:w-auto" onClick={() => setOpen(true)}>
        <CalendarX aria-hidden /> Cancel past booking…
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-balance">Cancel this past booking?</DialogTitle>
            <DialogDescription className="text-pretty">
              {memberName}&apos;s booking is cancelled the same way as a normal staff cancel: any restorable class credit goes back to its original month, and the member gets a cancellation notice. The reason is saved with that notice. The class has started, so nobody is promoted from the waitlist.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Reason">
            <FieldTextarea name="reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: booked in error, member never arrived and was not marked" maxLength={1000} required />
          </FormField>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Keep booking</Button>
            <Button type="button" variant="destructive" onClick={submit} disabled={!ready || pending}>
              {pending ? "Cancelling…" : "Cancel booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
