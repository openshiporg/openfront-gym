import Link from "next/link";

export default function JoinCancelledPage({ tier }: { tier?: string }) {
  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="bg-[#1c1b1b] p-10">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">Checkout cancelled</p>
          <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
            No charge.
            <br />
            No problem.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">
            No payment was captured. You can return to your selected plan at any time and continue when you’re ready.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={tier ? `/join?tier=${tier}` : "/join"} className="inline-flex bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95">
              Return to join
            </Link>
            <Link href="/memberships" className="inline-flex border border-[#7df4ff] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#7df4ff] transition-colors hover:bg-[#7df4ff]/10">
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
