"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How do class credits work?",
    a: "Credits are included with selected plans and reset each billing cycle. Each booked class consumes one credit unless your tier includes unlimited classes.",
  },
  {
    q: "Can I freeze my membership?",
    a: "Yes. Eligible plans can be frozen for a limited period each year. During a freeze, facility and class access are paused and billing rules depend on your plan policy.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Monthly memberships typically require notice before the next billing cycle. Annual commitments may carry different terms depending on the tier configuration.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Yes. Tier changes can be made later and should flow through billing, access, and class entitlement logic from your account and Stripe-backed membership state.",
  },
  {
    q: "Do you support access-only memberships?",
    a: "Yes. A plan can include full facility access while including zero class credits, making it suitable for gyms that separate floor access from class access.",
  },
  {
    q: "What happens if I miss a class?",
    a: "Cancellation and no-show policy can vary by gym. In the current product direction, class access, credits, and future attendance policy will all tie back to your membership tier and booking state.",
  },
];

export default function MembershipFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="text-[#e5e2e1]">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Protocol & access</p>
        <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.06em] text-white">
          Questions
        </h2>
      </div>
      <div className="divide-y divide-white/10">
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={faq.q} className="py-5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 text-left"
              >
                <span className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">
                  {faq.q}
                </span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-[#818cf8] transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#c4c7c7]">{faq.a}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
