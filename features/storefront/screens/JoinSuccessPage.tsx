import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { cookies } from "next/headers";
import { CheckCircle2, Clock3 } from "lucide-react";
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
    result = { ok: false, message: "This link has no checkout confirmation. Check your membership, or use the link from your checkout." };
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
        message: "Activation isn’t confirmed yet. Don’t start another payment; check your membership or contact the front desk with the checkout time.",
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
        ) : (
          <>
            <span className="sf-outcome-mark" data-tone="warn"><Clock3 aria-hidden="true" /></span>
            <h1 className="sf-h1">Payment not yet verified</h1>
            <p className="sf-lead">{result.message}</p>
            <div className="sf-actions">
              <Link href="/account/membership" className="sf-btn">Check membership</Link>
              {sessionId ? <Link href={`/join/success?session_id=${encodeURIComponent(sessionId)}`} className="sf-btn" data-variant="secondary">Check again</Link> : null}
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
      <button type="submit" className="sf-btn" data-variant={variant} data-size="lg">{children}</button>
    </form>
  );
}
