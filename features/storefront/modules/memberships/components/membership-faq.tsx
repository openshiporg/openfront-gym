"use client"

import { useState } from "react"

const faqs = [
  {
    question: "How do class credits work?",
    answer: "Class credits are included with your membership and reset each month. Each class costs 1 credit to book. Premium members get 15 credits, while Basic members get 5. Unused credits don't roll over to the next month.",
  },
  {
    question: "Can I freeze my membership?",
    answer: "Yes, you can freeze your membership for up to 3 months per year. During the freeze period, you won't be charged, but you also won't have access to classes or facilities.",
  },
  {
    question: "What's your cancellation policy?",
    answer: "You can cancel your membership anytime with 30 days notice. Annual memberships can be cancelled after 3 months with a prorated refund of unused months.",
  },
  {
    question: "Can I upgrade or downgrade my plan?",
    answer: "Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the start of your next billing cycle.",
  },
  {
    question: "Do you offer family plans?",
    answer: "Yes! Add family members to any plan for 50% off the monthly rate. Each family member gets their own class credits and can book independently.",
  },
  {
    question: "What if I miss a class?",
    answer: "You can cancel a booking up to 2 hours before the class starts for a full credit refund. Late cancellations or no-shows will not receive a credit refund.",
  },
]

export default function MembershipFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-center mb-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="border rounded-lg">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="font-medium">{faq.question}</span>
              <svg
                className={`w-5 h-5 text-muted-foreground transition-transform ${
                  openIndex === index ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {openIndex === index && (
              <div className="px-4 pb-4">
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
