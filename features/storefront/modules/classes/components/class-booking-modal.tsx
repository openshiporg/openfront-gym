"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, MapPin, Users, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { bookClass } from "@/features/storefront/lib/actions/classes";

type ClassBookingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: string;          // ClassInstance.id
    name: string;
    instructor: string;
    time: string;
    duration: number;
    spots: number;
    capacity: number;
    difficulty?: string;
    date?: string;
    location?: string;
    isBookable?: boolean;
  };
  onBookingSuccess?: () => void;
  onReturnFocus?: () => void;
};

export default function ClassBookingModal({
  isOpen,
  onClose,
  classData,
  onBookingSuccess,
  onReturnFocus,
}: ClassBookingModalProps) {
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    actionHref?: string;
    actionLabel?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleBook = () => {
    startTransition(async () => {
      const res = await bookClass(classData.id);
      if (res.success) {
        const message =
          res.status === "waitlist"
            ? `Joined the waitlist${res.waitlistPosition ? ` at position #${res.waitlistPosition}` : ""}. This is not a confirmed space. Check your bookings for promotion; an eligible credit is used when your place is confirmed.`
            : `Booked. You have ${res.creditsRemaining === -1 ? "unlimited" : res.creditsRemaining} class credit(s) remaining.`;
        setResult({ success: true, message });
        router.refresh();
        onBookingSuccess?.();
      } else {
        setResult({
          success: false,
          message: res.error,
          actionHref: res.actionHref,
          actionLabel: res.actionLabel,
        });
      }
    });
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const spotsLeft = classData.spots;
  const isFull = spotsLeft <= 0;
  const isBookable = classData.isBookable !== false;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isPending) handleClose(); }}>
      <DialogContent onCloseAutoFocus={event => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }} className="sf-booking-dialog max-w-md border-[var(--sf-border)] bg-[var(--sf-surface)] text-[var(--sf-foreground)] shadow-none">
        <DialogHeader>
          <DialogTitle>{isFull ? "Join this session’s waitlist" : "Review your class booking"}</DialogTitle>
          <DialogDescription>
            Check the session details below. Your membership and eligibility are confirmed when you submit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Class info */}
          <div className="space-y-2 border border-[var(--sf-border)] bg-[var(--sf-secondary)] p-4">
            <p className="font-semibold">{classData.name}</p>
            {classData.date ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {classData.date}
              </p>
            ) : null}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {classData.time} · typically {classData.duration} min
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {isFull ? (
                  <span className="text-[var(--sf-warning)] font-medium">Full</span>
                ) : (
                  <span className={spotsLeft <= 3 ? "text-[var(--sf-warning)] font-medium" : ""}>
                    {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
                  </span>
                )}
              </span>
            </div>
            {classData.instructor ? (
              <p className="text-xs text-muted-foreground">with {classData.instructor}</p>
            ) : null}
            {classData.location ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {classData.location}
              </p>
            ) : null}
          </div>

          {/* Result feedback */}
          {result && (
            <div role={result.success ? "status" : "alert"} className={`flex items-start gap-2 p-3 text-sm ${result.success ? "sf-status-success" : "sf-status-error"}`}>
              {result.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              {result.message}
            </div>
          )}

          {result && !result.success && result.actionHref && result.actionLabel ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button asChild>
                <Link href={result.actionHref}>{result.actionLabel}</Link>
              </Button>
            </div>
          ) : null}

          {/* Actions */}
          {!result?.success && !result?.actionHref && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} disabled={isPending} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleBook}
                disabled={isPending || !isBookable}
                className="flex-1"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isBookable ? "No upcoming session" : isFull ? "Join waitlist" : "Confirm booking"}
              </Button>
            </div>
          )}
          {result?.success ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleClose}>Done</Button>
              <Button asChild>
                <Link href="/account/bookings">View bookings</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
