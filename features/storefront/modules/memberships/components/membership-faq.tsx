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
    a: "Cancellation and no-show policy can vary by gym. Class access, credits, and attendance policy tie back to your membership tier and booking state.",
  },
];

export default function MembershipFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      <div className="mb-8">
        <p className="sf-eyebrow">Questions</p>
        <h2 className="sf-display mt-3 text-4xl text-[var(--color-ink)]">Before you join</h2>
      </div>
      <div className="divide-y divide-[var(--color-rule)]">
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={faq.q} className="py-5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-lg font-medium text-[var(--color-ink)]">{faq.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-[var(--color-accent)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen ? (
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-muted)]">{faq.a}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
