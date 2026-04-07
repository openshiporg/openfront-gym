import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { provisionMembershipFromCheckoutSession } from "@/features/integrations/payment/stripe";

export default async function JoinSuccessPage({ sessionId }: { sessionId?: string }) {
  let result:
    | { ok: true; tierName: string; billingCycle: string }
    | { ok: false; message: string };

  if (!sessionId) {
    result = { ok: false, message: "Missing Stripe checkout session ID." };
  } else {
    try {
      const provisioned = await provisionMembershipFromCheckoutSession(sessionId);
      result = {
        ok: true,
        tierName: provisioned.tierName,
        billingCycle: provisioned.billingCycle,
      };
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to verify membership activation.",
      };
    }
  }

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="bg-[#1c1b1b] p-10">
          {result.ok ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-[#a5b4fc]" />
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Membership activated</p>
              <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
                Welcome to
                <br />
                the program
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">
                Your <span className="text-white font-medium">{result.tierName}</span> plan is now active on a <span className="text-white font-medium">{result.billingCycle}</span> billing cycle. You can now book classes, manage billing, and use your member account.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/account" className="inline-flex bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-transform active:scale-95">
                  Go to account
                </Link>
                <Link href="/schedule" className="inline-flex border border-[#a5b4fc] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#a5b4fc] transition-colors hover:bg-[#a5b4fc]/10">
                  Browse schedule
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Checkout complete</p>
              <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
                Verification
                <br />
                still needed
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">{result.message}</p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/account" className="inline-flex bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-transform active:scale-95">
                  Go to account
                </Link>
                <Link href="/join" className="inline-flex border border-[#a5b4fc] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#a5b4fc] transition-colors hover:bg-[#a5b4fc]/10">
                  Back to join
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
