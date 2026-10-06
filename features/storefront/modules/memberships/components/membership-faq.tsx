"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Where do plan prices and terms come from?",
    a: "The amounts, access hours, class credits, guest passes, contract length, and freeze eligibility shown here come from the gym's published membership tiers.",
  },
  {
    q: "How does class booking work?",
    a: "Choose a dated session from the schedule. The server checks your membership, credits, booking status, and current capacity again before confirming a spot.",
  },
  {
    q: "What happens when a class is full?",
    a: "The booking flow offers the waitlist when that dated session has no open spots. Your resulting status and waitlist position come from the server response.",
  },
  {
    q: "Can I freeze my membership?",
    a: "A signed-in member can request a freeze only when the current plan allows it and the membership has the provider-backed state required by the account controls.",
  },
  {
    q: "Can I stop renewal?",
    a: "The member account can end renewal after the current paid period when an active provider subscription is connected. The account shows the resulting access-through date.",
  },
  {
    q: "Where are payment methods and invoices managed?",
    a: "Eligible signed-in members can open the provider-hosted billing portal from the membership page. If no provider customer is connected, the page directs the member to the front desk.",
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
