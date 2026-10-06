import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { cookies } from "next/headers";
import { CheckCircle2 } from "lucide-react";
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
    result = { ok: false, message: "This link does not contain a checkout confirmation. Check your membership, or return using the confirmation link from your checkout." };
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
        message: "Membership activation could not be confirmed yet. Do not start another payment; check your account or contact the front desk with the checkout time.",
      };
    }
  }

  return (
    <div className="sf-page px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-3xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-10">
        {result.ok ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-[var(--color-accent)]" />
            <p className="sf-eyebrow mt-5">Membership confirmed</p>
            <h1 className="sf-display mt-3 text-[var(--text-display-s)]">Welcome to the club</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">
              Your <span className="font-medium text-[var(--color-ink)]">{result.tierName}</span> plan is now active on a{" "}
              <span className="font-medium text-[var(--color-ink)]">{result.billingCycle}</span> billing cycle.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <CheckoutReturnButton
                destination={returnTo || "/account"}
                className="sf-btn-primary px-6"
              >
                {returnTo?.startsWith("/schedule") ? "Continue class booking" : returnTo ? "Continue" : "Go to account"}
              </CheckoutReturnButton>
              <CheckoutReturnButton destination="/account/membership" className="sf-btn-outline px-6">
                View membership
              </CheckoutReturnButton>
            </div>
          </>
        ) : (
          <>
            <p className="sf-eyebrow">Payment verification</p>
            <h1 className="sf-display mt-3 text-[var(--text-display-s)]">Verification still needed</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">{result.message}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/account/membership" className="sf-btn-primary">Check membership</Link>
              {sessionId && <Link href={`/join/success?session_id=${encodeURIComponent(sessionId)}`} className="sf-btn-secondary">Check confirmation again</Link>}
              <Link href="/contact" className="sf-btn-secondary">Contact the front desk</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckoutReturnButton({
  destination,
  className,
  children,
}: {
  destination: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <form action={clearCheckoutReturnAndRedirect}>
      <input type="hidden" name="destination" value={destination} />
      <button type="submit" className={className}>{children}</button>
    </form>
  );
}
