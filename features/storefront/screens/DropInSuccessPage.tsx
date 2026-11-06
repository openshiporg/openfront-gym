import Link from "next/link";
import { CheckCircle2, Clock3, Receipt, RotateCcw } from "lucide-react";
import { completeDropInCheckoutAction } from "@/features/storefront/lib/actions/drop-in";
import { getClassOccurrenceById } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

function formatWhen(startsAt: string, timeZone: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

/** Where Stripe returns a drop-in buyer: confirms the paid class (or the automatic refund). */
export default async function DropInSuccessPage({ sessionId }: { sessionId?: string }) {
  let outcome: Awaited<ReturnType<typeof completeDropInCheckoutAction>> | null = null;
  if (sessionId) {
    try { outcome = await completeDropInCheckoutAction(sessionId); } catch { outcome = null; }
  }
  const [occurrence, config] = await Promise.all([
    outcome?.classInstanceId ? getClassOccurrenceById(outcome.classInstanceId).catch(() => null) : Promise.resolve(null),
    getStorefrontConfig().catch(() => null),
  ]);
  const when = occurrence ? formatWhen(occurrence.startsAt, config?.timezone || "UTC") : "";

  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        {outcome?.state === "booked" ? (
          <>
            <span className="sf-outcome-mark" data-tone="ok"><CheckCircle2 aria-hidden="true" /></span>
            <h1 className="sf-h1">You’re booked</h1>
            <p className="sf-lead">Your drop-in is paid. Arrive a few minutes early and check in at the front desk.</p>
            {occurrence ? (
              <dl className="sf-facts" style={{ width: "100%" }}>
                <div><dt>Class</dt><dd>{occurrence.name}</dd></div>
                {when ? <div><dt>When</dt><dd>{when}</dd></div> : null}
                {occurrence.instructor ? <div><dt>Coach</dt><dd>{occurrence.instructor.name}</dd></div> : null}
                {occurrence.location ? <div><dt>Location</dt><dd>{occurrence.location.name}</dd></div> : null}
              </dl>
            ) : null}
            <div className="sf-actions">
              <Link href="/account/bookings" className="sf-btn" data-variant="accent">Your bookings</Link>
              <Link href="/memberships" className="sf-btn" data-variant="secondary">See memberships</Link>
            </div>
          </>
        ) : outcome?.state === "refunded" ? (
          <>
            <span className="sf-outcome-mark" data-tone="warn"><RotateCcw aria-hidden="true" /></span>
            <h1 className="sf-h1">We couldn’t hold your place</h1>
            <p className="sf-lead">{outcome.message || "The class filled while you were paying."} Your payment has been refunded in full to your card.</p>
            <div className="sf-actions">
              <Link href="/schedule" className="sf-btn" data-variant="accent">Choose another class</Link>
              <Link href="/contact" className="sf-btn" data-variant="secondary">Contact the club</Link>
            </div>
          </>
        ) : outcome?.state === "expired" ? (
          <>
            <span className="sf-outcome-mark"><Receipt aria-hidden="true" /></span>
            <h1 className="sf-h1">Checkout expired</h1>
            <p className="sf-lead">You weren’t charged. Pick the class again to start a new checkout.</p>
            <div className="sf-actions">
              <Link href={outcome.classInstanceId ? `/schedule?book=${encodeURIComponent(outcome.classInstanceId)}` : "/schedule"} className="sf-btn" data-variant="accent">Back to the class</Link>
            </div>
          </>
        ) : sessionId ? (
          <>
            <span className="sf-outcome-mark" data-tone="warn"><Clock3 aria-hidden="true" /></span>
            <h1 className="sf-h1">Confirming your payment</h1>
            <p className="sf-lead">This can take a moment. Please don’t pay again: check again shortly, or contact the front desk with your checkout time.</p>
            <div className="sf-actions" data-stack>
              <Link href={`/schedule/drop-in?session_id=${encodeURIComponent(sessionId)}`} className="sf-btn">Check again</Link>
              <Link href="/account/bookings" className="sf-btn" data-variant="secondary">Your bookings</Link>
            </div>
          </>
        ) : (
          <>
            <span className="sf-outcome-mark"><Receipt aria-hidden="true" /></span>
            <h1 className="sf-h1">No checkout to confirm</h1>
            <p className="sf-lead">This page confirms a drop-in class after payment, and this link didn’t come from one.</p>
            <div className="sf-actions">
              <Link href="/schedule" className="sf-btn" data-variant="accent">Class schedule</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
