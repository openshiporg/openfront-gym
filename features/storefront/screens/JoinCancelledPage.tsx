import Link from "next/link";
import { joinPath } from "@/features/storefront/lib/return-path";
import { clearCheckoutReturnAndRedirect } from "@/features/integrations/payment/membership-checkout";

export default function JoinCancelledPage({ tier, returnTo }: { tier?: string; returnTo?: string | null }) {
  return (
    <div className="sf-page px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-3xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-10">
        <p className="sf-eyebrow">Checkout cancelled</p>
        <h1 className="sf-display mt-3 text-[var(--text-display-s)]">Pick up when you’re ready.</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">
          Checkout was left before activation was confirmed. If you submitted payment, check your membership before starting another checkout.
        </p>
        <div className="mt-10 flex flex-wrap gap-3"><Link href="/account/membership" className="sf-btn-secondary">Check membership</Link>
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
