"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { bookClass } from "@/features/storefront/lib/actions/classes";
import { acceptParticipationTermsAction } from "@/features/storefront/lib/actions/participation";
import { contactPath } from "@/features/storefront/lib/contact-config";
import { difficultyLabel } from "@/features/storefront/lib/presentation";
import { bookingReturnPath, joinPath } from "@/features/storefront/lib/return-path";
import { SessionState } from "@/features/storefront/modules/common/training";
import { Sheet } from "@/features/storefront/modules/common/sheet";
import { Banner } from "@/features/storefront/modules/common/ui";
import LoginPage from "@/features/storefront/screens/LoginPage";

/** Who is looking at the booking sheet, resolved on the server so the sheet opens on the right step. */
export type BookingViewer = {
  signedIn: boolean;
  membership: "active" | "attention" | "none";
  signupsAllowed: boolean;
  /** The member's upcoming confirmed or waitlisted bookings, by session id. */
  bookings?: Record<string, { status: "confirmed" | "waitlist"; waitlistPosition?: number | null }>;
  /** Published participation terms, accepted at sign-up. */
  terms?: { policyId: string; version: string } | null;
  /** Signed-in member's standing against the current participation terms. */
  participation?: { policyId: string; version: string; accepted: boolean; termsHref: string } | null;
};

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
    waitlist?: number;
    difficulty?: string;
    date?: string;
    location?: string;
    isBookable?: boolean;
  };
  viewer?: BookingViewer;
  onBookingSuccess?: () => void;
  onReturnFocus?: () => void;
};

type Result =
  | { success: true; waitlist: boolean; title: string; message: string }
  | { success: false; message: string; actionHref?: string; actionLabel?: string };

export default function ClassBookingModal({
  isOpen,
  onClose,
  classData,
  viewer,
  onBookingSuccess,
  onReturnFocus,
}: ClassBookingModalProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const returnTo = bookingReturnPath(classData.id);

  const handleBook = () => {
    startTransition(async () => {
      const res = await bookClass(classData.id);
      if (res.success) {
        const waitlist = res.status === "waitlist";
        setResult({
          success: true,
          waitlist,
          title: waitlist ? `On the waitlist${res.waitlistPosition ? ` · position ${res.waitlistPosition}` : ""}` : "Booked",
          message: waitlist
            ? "Not a confirmed space yet."
            : res.creditsRemaining === -1 ? "Unlimited classes on your plan." : `${res.creditsRemaining} class ${res.creditsRemaining === 1 ? "credit" : "credits"} left.`,
        });
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

  const handleAcceptTerms = (policyId: string) => {
    startTransition(async () => {
      const accepted = await acceptParticipationTermsAction(policyId);
      if (accepted.success) { setTermsError(null); setTermsAccepted(true); router.refresh(); }
      else setTermsError(accepted.error || "Your acceptance wasn't saved. Try again.");
    });
  };

  const handleClose = () => {
    setResult(null);
    setTermsError(null);
    onClose();
  };

  const isFull = classData.spots <= 0;
  const isBookable = classData.isBookable !== false;
  const level = difficultyLabel(classData.difficulty);
  const when = [classData.date, classData.time].filter(Boolean).join(" · ");
  const contactLink = <Link href={contactPath("booking", returnTo)} className="sf-link">Contact the club</Link>;
  const existing = viewer?.bookings?.[classData.id];
  const needsTerms = Boolean(viewer?.participation && !viewer.participation.accepted && !termsAccepted);
  const step = !viewer || result ? "book" : existing ? "booked" : !viewer.signedIn ? "account" : viewer.membership === "none" ? "membership" : viewer.membership === "attention" ? "attention" : needsTerms ? "terms" : "book";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => { if (!open && !isPending) handleClose(); }}
      title={classData.name}
      description={when}
      dismissible={!isPending}
      onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}
    >
      <dl className="sf-facts">
        <div><dt>Spaces</dt><dd><SessionState spots={classData.spots} capacity={classData.capacity} waitlist={classData.waitlist} long /></dd></div>
        <div><dt>Coach</dt><dd>{classData.instructor || "Not published"}</dd></div>
        <div><dt>Length</dt><dd>{classData.duration} min</dd></div>
        {level ? <div><dt>Level</dt><dd>{level}</dd></div> : null}
        {classData.location ? <div><dt>Location</dt><dd>{classData.location}</dd></div> : null}
      </dl>

      {step === "booked" && existing ? (
        <>
          <Banner
            tone={existing.status === "waitlist" ? "warn" : "ok"}
            title={existing.status === "waitlist" ? `You’re on the waitlist${existing.waitlistPosition ? ` · position ${existing.waitlistPosition}` : ""}` : "You’re booked for this class"}
          >
            {existing.status === "waitlist" ? "If a place opens, it’s offered in waitlist order while your membership and credits still allow it. Leave the waitlist from your bookings." : "Cancel from your bookings if you can’t make it."}
          </Banner>
          <div className="sf-sheet-actions">
            <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Close</button>
            <Link href="/account/bookings" className="sf-btn" data-variant="accent">Your bookings</Link>
          </div>
        </>
      ) : step === "account" ? (
        <>
          <Banner
            title={viewer?.signupsAllowed ? "Create an account or sign in to book" : "Sign in to book"}
            action={<Link href={contactPath("trial", returnTo)} className="sf-link">Ask about a drop-in or trial visit</Link>}
          >
            You’ll come back to this class to confirm. Visiting once? Drop-ins and trial visits are arranged by the front desk.
          </Banner>
          <LoginPage redirectTo={returnTo} allowSignup={viewer?.signupsAllowed} defaultView="signup" terms={viewer?.terms} />
        </>
      ) : step === "terms" && viewer?.participation ? (
        <>
          <Banner tone="warn" title="Accept the participation terms to book">
            Read the <Link href={viewer.participation.termsHref} className="sf-link" target="_blank">participation terms</Link> (version {viewer.participation.version}). The club records your acceptance once for this version.
          </Banner>
          {termsError ? <Banner tone="bad" action={contactLink}>{termsError}</Banner> : null}
          <form className="sf-form" onSubmit={(event) => { event.preventDefault(); handleAcceptTerms(viewer.participation!.policyId); }}>
            <label className="sf-check"><input type="checkbox" name="acceptTerms" required /><span>I accept the participation terms, version {viewer.participation.version}</span></label>
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose} disabled={isPending}>Close</button>
              <button type="submit" className="sf-btn" data-variant="accent" disabled={isPending}>
                {isPending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
                {isPending ? "Saving…" : "Accept and continue"}
              </button>
            </div>
          </form>
        </>
      ) : step === "membership" ? (
        <>
          <Banner tone="warn" title="A membership is needed to book classes" action={contactLink}>
            Choose a plan, then you’ll come back to this class to confirm.
          </Banner>
          <div className="sf-sheet-actions">
            <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Close</button>
            <Link href={joinPath(null, returnTo)} className="sf-btn" data-variant="accent">Choose membership</Link>
          </div>
        </>
      ) : step === "attention" ? (
        <>
          <Banner tone="warn" title="Your membership needs attention before you can book" action={contactLink} />
          <div className="sf-sheet-actions">
            <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Close</button>
            <Link href="/account/membership" className="sf-btn" data-variant="accent">Review membership</Link>
          </div>
        </>
      ) : (
        <>
          {result && result.success ? (
            <Banner tone={result.waitlist ? "warn" : "ok"} title={result.title}>{result.message}</Banner>
          ) : result ? (
            <Banner tone="bad" action={contactLink}>{result.message}</Banner>
          ) : null}

          {result && result.success ? (
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Done</button>
              <Link href="/account/bookings" className="sf-btn">Your bookings</Link>
            </div>
          ) : result && !result.success && result.actionHref && result.actionLabel ? (
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Close</button>
              <Link href={result.actionHref} className="sf-btn" data-variant="accent">{result.actionLabel}</Link>
            </div>
          ) : (
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose} disabled={isPending}>Cancel</button>
              <button type="button" className="sf-btn" data-variant="accent" onClick={handleBook} disabled={isPending || !isBookable}>
                {isPending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
                {!isBookable ? "Unavailable" : isPending ? (isFull ? "Joining…" : "Booking…") : isFull ? "Join waitlist" : "Confirm booking"}
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
