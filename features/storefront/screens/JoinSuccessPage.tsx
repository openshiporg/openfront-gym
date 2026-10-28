import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { cookies } from "next/headers";
import { CheckCircle2, Clock3, Receipt } from "lucide-react";
import {
  clearCheckoutReturnAndRedirect,
  completeMembershipCheckoutAction,
} from "@/features/integrations/payment/membership-checkout";
import { CHECKOUT_RETURN_COOKIE } from "@/features/integrations/payment/membership-checkout-contract";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export default async function JoinSuccessPage({ sessionId }: { sessionId?: string }) {
  const savedReturnTo = (await cookies()).get(CHECKOUT_RETURN_COOKIE)?.value;
  const returnTo = savedReturnTo ? safeStorefrontReturnPath(savedReturnTo) : null;
  let result: { ok: true; tierName: string; billingCycle: string } | { ok: false; message: string };

  if (!sessionId) {
    result = { ok: false, message: "This page confirms a new membership after checkout, and this link didn’t come from one. If you just paid, check your membership or open the link from your checkout." };
  } else {
    try {
      const provisioned = await completeMembershipCheckoutAction(sessionId);
      const currentUser = await getUser();
      if (currentUser?.membership?.status !== "active") throw new Error("Membership not active");
      result = {
        ok: true,
        tierName: currentUser.membership.agreementSnapshot?.tierName || currentUser.membership.tier?.name || provisioned.tierName,
        billingCycle: currentUser.membership.billingCycle || provisioned.billingCycle,
      };
    } catch {
      result = {
        ok: false,
        message: "We haven’t confirmed your membership yet. This can take a minute. Please don’t start another payment: check again shortly, or contact the front desk with your checkout time.",
      };
    }
  }

  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        {result.ok ? (
          <>
            <span className="sf-outcome-mark" data-tone="ok"><CheckCircle2 aria-hidden="true" /></span>
            <h1 className="sf-h1">Membership active</h1>
            <dl className="sf-facts" style={{ width: "100%" }}>
              <div><dt>Plan</dt><dd>{result.tierName}</dd></div>
              <div><dt>Billing</dt><dd style={{ textTransform: "capitalize" }}>{result.billingCycle}</dd></div>
            </dl>
            <div className="sf-actions">
              <CheckoutReturnButton destination={returnTo || "/schedule"} variant="accent">
                {returnTo?.startsWith("/schedule") ? "Continue booking" : returnTo ? "Continue" : "Book a class"}
              </CheckoutReturnButton>
              <CheckoutReturnButton destination="/account/membership" variant="secondary">
                Membership
              </CheckoutReturnButton>
            </div>
          </>
        ) : sessionId ? (
          <>
            <span className="sf-outcome-mark" data-tone="warn"><Clock3 aria-hidden="true" /></span>
            <h1 className="sf-h1">Confirming your payment</h1>
            <p className="sf-lead">{result.message}</p>
            <div className="sf-actions" data-stack>
              <Link href={`/join/success?session_id=${encodeURIComponent(sessionId)}`} className="sf-btn">Check again</Link>
              <Link href="/account/membership" className="sf-btn" data-variant="secondary">Check membership</Link>
              <Link href="/contact" className="sf-btn" data-variant="ghost">Contact the front desk</Link>
            </div>
          </>
        ) : (
          <>
            <span className="sf-outcome-mark"><Receipt aria-hidden="true" /></span>
            <h1 className="sf-h1">No checkout to confirm</h1>
            <p className="sf-lead">{result.message}</p>
            <div className="sf-actions" data-stack>
              <Link href="/account/membership" className="sf-btn">Check membership</Link>
              <Link href="/memberships" className="sf-btn" data-variant="secondary">View memberships</Link>
              <Link href="/contact" className="sf-btn" data-variant="ghost">Contact</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckoutReturnButton({
  destination,
  variant,
  children,
}: {
  destination: string;
  variant: "accent" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <form action={clearCheckoutReturnAndRedirect}>
      <input type="hidden" name="destination" value={destination} />
      <button type="submit" className="sf-btn" data-variant={variant}>{children}</button>
    </form>
  );
}
