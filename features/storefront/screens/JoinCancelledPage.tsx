import Link from "next/link";
import { joinPath } from "@/features/storefront/lib/return-path";
import { clearCheckoutReturnAndRedirect } from "@/features/integrations/payment/membership-checkout";

export default function JoinCancelledPage({ tier, returnTo }: { tier?: string; returnTo?: string | null }) {
  return (
    <div className="sf-page px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-3xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-10">
        <p className="sf-eyebrow">Checkout cancelled</p>
        <h1 className="sf-display mt-3 text-[var(--text-display-s)]">No charge. No problem.</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">
          No payment was captured. Return to your selected plan whenever you&apos;re ready.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={joinPath(tier, returnTo)} className="sf-btn-primary px-6">
            Return to join
          </Link>
          <form action={clearCheckoutReturnAndRedirect}>
            <input type="hidden" name="destination" value="/memberships" />
            <button type="submit" className="sf-btn-outline px-6">Compare plans</button>
          </form>
        </div>
      </div>
    </div>
  );
}
