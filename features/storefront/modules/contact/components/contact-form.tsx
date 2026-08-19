"use client";

import { useActionState } from "react";
import { submitContactFormAction, type ContactFormState } from "@/features/storefront/lib/actions/contact";

const initialState: ContactFormState = {
  status: "idle",
  message: null,
  reference: null,
};

export function ContactForm({
  deliveryConfigured,
  supportEmail,
}: {
  deliveryConfigured: boolean;
  supportEmail: string | null;
}) {
  const [state, action, pending] = useActionState(submitContactFormAction, initialState);
  const inputClass = "h-12 w-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]";

  if (!deliveryConfigured) {
    return (
      <div className="mt-8 border border-amber-700/25 bg-amber-50 px-5 py-5 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Online inquiry delivery is not configured.</p>
        <p className="mt-2">No message has been accepted or stored. Please call the front desk{supportEmail ? " or email us directly" : ""}.</p>
        {supportEmail ? (
          <a className="mt-3 inline-flex font-semibold underline underline-offset-4" href={`mailto:${supportEmail}`}>
            Email {supportEmail}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      {state.status === "sent" ? (
        <div role="status" className="border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {state.message} Reference: <strong>{state.reference}</strong>.
        </div>
      ) : null}
      {state.status === "error" ? (
        <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p>{state.message}</p>
          {supportEmail ? (
            <a className="mt-2 inline-flex font-semibold underline underline-offset-4" href={`mailto:${supportEmail}`}>
              Email {supportEmail} directly
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <input name="firstName" required maxLength={100} className={inputClass} placeholder="First name" />
        <input name="lastName" required maxLength={100} className={inputClass} placeholder="Last name" />
      </div>
      <input name="email" required maxLength={254} className={inputClass} placeholder="Email" type="email" />
      <input name="phone" maxLength={40} className={inputClass} placeholder="Phone" type="tel" />
      <select name="topic" className={inputClass}>
        <option>Membership inquiry</option>
        <option>Class information</option>
        <option>Schedule a tour</option>
        <option>General support</option>
      </select>
      <textarea
        name="message"
        required
        maxLength={5000}
        className="min-h-[160px] w-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
        placeholder="How can we help?"
      />
      <button type="submit" disabled={pending} className="sf-btn-primary px-6 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
