"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { bookClass } from "@/features/storefront/lib/actions/classes";
import { redirectToDropInCheckout } from "@/features/storefront/lib/actions/drop-in";
import { acceptParticipationTermsAction } from "@/features/storefront/lib/actions/participation";
import { contactPath } from "@/features/storefront/lib/contact-config";
import { difficultyLabel } from "@/features/storefront/lib/presentation";
import { bookingReturnPath, joinPath } from "@/features/storefront/lib/return-path";
import { SessionState } from "@/features/storefront/modules/common/training";
import { Sheet } from "@/features/storefront/modules/common/sheet";
import { Banner } from "@/features/storefront/modules/common/ui";
import LoginPage from "@/features/storefront/screens/LoginPage";
import { formatClassCreditsLeft, isUnlimitedCredits } from "@/lib/class-credits";

/** Who is looking at the booking sheet, resolved on the server so the sheet opens on the right step. */
export type BookingViewer = {
  signedIn: boolean;
  membership: "active" | "attention" | "none";
  signupsAllowed: boolean;
  /** Club's online drop-in price in cents; 0 when drop-ins are arranged by the front desk. */
  dropInPrice?: number;
  /** Hours before class inside which a member's cancel forfeits the credit; 0 when the club has no window. */
  lateCancelHours?: number;
  /** A drop-in checkout that couldn't start, shown on the membership step. */
  dropInError?: string | null;
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
            : isUnlimitedCredits(res.creditsRemaining) ? "Unlimited classes on your plan." : `${formatClassCreditsLeft(res.creditsRemaining) ?? "Booking confirmed"}.`,
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
  const dropInPrice = viewer?.dropInPrice && viewer.dropInPrice >= 50 ? viewer.dropInPrice : 0;
  const dropInLabel = dropInPrice ? `$${(dropInPrice / 100).toFixed(dropInPrice % 100 ? 2 : 0)}` : "";
  const canDropIn = Boolean(dropInPrice) && isBookable && classData.spots > 0;
  const existing = viewer?.bookings?.[classData.id];
  const needsTerms = Boolean(viewer?.participation && !viewer.participation.accepted && !termsAccepted);
  const step = !viewer || result ? "book" : existing ? "booked" : !viewer.signedIn ? "account" : viewer.membership === "none" ? (needsTerms && canDropIn ? "terms" : "membership") : viewer.membership === "attention" ? "attention" : needsTerms ? "terms" : "book";

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
            action={dropInPrice ? undefined : <Link href={contactPath("trial", returnTo)} className="sf-link">Ask about a drop-in or trial visit</Link>}
          >
            {dropInPrice
              ? `You’ll come back to this class to confirm. Visiting once? Sign in or create an account, then drop in for ${dropInLabel}.`
              : "You’ll come back to this class to confirm. Visiting once? Drop-ins and trial visits are arranged by the front desk."}
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
          {canDropIn ? (
            <Banner title={`Drop in for ${dropInLabel}`} action={contactLink}>
              Pay for this one class now and your place is confirmed.{viewer?.lateCancelHours ? ` Cancel at least ${viewer.lateCancelHours} hours before class for a full refund.` : " Cancel before class for a full refund."} Coming regularly? A membership includes classes.
            </Banner>
          ) : (
            <Banner tone="warn" title="A membership is needed to book classes" action={contactLink}>
              {dropInPrice && classData.spots <= 0 ? "This class is full, so drop-ins can’t book it. " : ""}Choose a plan, then you’ll come back to this class to confirm.
            </Banner>
          )}
          {viewer?.dropInError ? <Banner tone="bad" action={contactLink}>{viewer.dropInError}</Banner> : null}
          {canDropIn ? (
            <form action={redirectToDropInCheckout} className="sf-sheet-actions">
              <input type="hidden" name="classInstanceId" value={classData.id} />
              <Link href={joinPath(null, returnTo)} className="sf-btn" data-variant="secondary">Choose membership</Link>
              <DropInSubmit label={`Pay ${dropInLabel} and book`} />
            </form>
          ) : (
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose}>Close</button>
              <Link href={joinPath(null, returnTo)} className="sf-btn" data-variant="accent">Choose membership</Link>
            </div>
          )}
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
            <>
            {isBookable && !isFull && viewer?.lateCancelHours ? <p className="sf-meta">Can’t make it? Cancel at least {viewer.lateCancelHours} hours before class to keep your credit.</p> : null}
            <div className="sf-sheet-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={handleClose} disabled={isPending}>Cancel</button>
              <button type="button" className="sf-btn" data-variant="accent" onClick={handleBook} disabled={isPending || !isBookable}>
                {isPending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
                {!isBookable ? "Unavailable" : isPending ? (isFull ? "Joining…" : "Booking…") : isFull ? "Join waitlist" : "Confirm booking"}
              </button>
            </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function DropInSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sf-btn" data-variant="accent" disabled={pending}>
      {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
      {pending ? "Opening checkout…" : label}
    </button>
  );
}
