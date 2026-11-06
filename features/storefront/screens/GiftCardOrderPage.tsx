import Link from "next/link";
import { CheckCircle2, Clock3, Receipt } from "lucide-react";
import { confirmGiftCardOrder } from "@/features/storefront/lib/actions/gift-cards";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Stripe returns here; the order is read back from Stripe before the code is shown. */
export async function GiftCardOrderPage({ params }: { params: { ref?: string; token?: string; result?: string } }) {
  const { order, error } = params.ref && params.token ? await confirmGiftCardOrder(params.ref, params.token) : { order: null, error: "We couldn’t find that gift card order." };
  const cancelled = order && !order.code && (order.status === "cancelled" || params.result === "cancelled");
  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        {order?.code ? (
          <>
            <span className="sf-outcome-mark" data-tone="ok"><CheckCircle2 aria-hidden="true" /></span>
            <h1 className="sf-h1">Gift card ready</h1>
            <p className="sf-lead">{usd(order.amount)} gift card{order.recipientName ? ` for ${order.recipientName}` : ""}.{order.recipientEmail ? ` We’ve emailed the code to ${order.recipientEmail}.` : ""}</p>
            <dl className="sf-facts" style={{ width: "100%" }}>
              <div><dt>Code</dt><dd className="sf-num" style={{ letterSpacing: "0.08em" }}>{order.code}</dd></div>
              <div><dt>Value</dt><dd>{usd(order.amount)}</dd></div>
              {order.expiresAt ? <div><dt>Valid until</dt><dd>{new Date(order.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</dd></div> : null}
            </dl>
            <p className="sf-hint">Show the code at the front desk to pay for classes, passes or shop items.</p>
            <div className="sf-actions">
              <Link href="/schedule" className="sf-btn" data-variant="accent">See the schedule</Link>
              <Link href="/gift-cards" className="sf-btn" data-variant="secondary">Buy another</Link>
            </div>
          </>
        ) : cancelled ? (
          <>
            <span className="sf-outcome-mark"><Receipt aria-hidden="true" /></span>
            <h1 className="sf-h1">No charge made</h1>
            <p className="sf-lead">Checkout was cancelled, so your card wasn’t charged.</p>
            <div className="sf-actions"><Link href="/gift-cards" className="sf-btn" data-variant="accent">Back to gift cards</Link></div>
          </>
        ) : order ? (
          <>
            <span className="sf-outcome-mark" data-tone="warn"><Clock3 aria-hidden="true" /></span>
            <h1 className="sf-h1">Confirming your payment</h1>
            <p className="sf-lead">This can take a moment. Please don’t pay again. We’ll email the code as soon as it clears.</p>
            <div className="sf-actions">
              <Link href={`/gift-cards/order?ref=${encodeURIComponent(params.ref || "")}&token=${encodeURIComponent(params.token || "")}`} className="sf-btn">Check again</Link>
            </div>
          </>
        ) : (
          <>
            <span className="sf-outcome-mark"><Receipt aria-hidden="true" /></span>
            <h1 className="sf-h1">Order not found</h1>
            <p className="sf-lead">{error}</p>
            <div className="sf-actions"><Link href="/gift-cards" className="sf-btn" data-variant="accent">Gift cards</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
