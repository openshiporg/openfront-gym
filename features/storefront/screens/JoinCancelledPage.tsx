import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { joinPath } from "@/features/storefront/lib/return-path";
import { clearCheckoutReturnAndRedirect } from "@/features/integrations/payment/membership-checkout";

export default function JoinCancelledPage({ tier, returnTo, cycle }: { tier?: string; returnTo?: string | null; cycle?: "monthly" | "annual" }) {
  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        <span className="sf-outcome-mark"><RotateCcw aria-hidden="true" /></span>
        <h1 className="sf-h1">Checkout cancelled</h1>
        <p className="sf-lead">Checkout ended before activation was confirmed. If you submitted payment, check your membership before trying again.</p>
        <div className="sf-actions">
          <Link href={joinPath(tier, returnTo, cycle)} className="sf-btn" data-variant="accent" data-size="lg">Back to join</Link>
          <Link href="/account/membership" className="sf-btn" data-variant="secondary" data-size="lg">Check membership</Link>
          <form action={clearCheckoutReturnAndRedirect}>
            <input type="hidden" name="destination" value="/memberships" />
            <button type="submit" className="sf-btn" data-variant="ghost" data-size="lg">Compare plans</button>
          </form>
        </div>
      </div>
    </div>
  );
}
