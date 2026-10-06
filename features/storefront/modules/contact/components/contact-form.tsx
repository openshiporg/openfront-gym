"use client";

import { useActionState } from "react";
import { submitContactFormAction, type ContactFormState } from "@/features/storefront/lib/actions/contact";

const initialState: ContactFormState = { status: "idle", message: null, reference: null };
const inputClass = "h-12 w-full border border-[var(--sf-border-strong)] bg-[var(--sf-surface)] px-4 text-sm text-[var(--sf-foreground)] placeholder:text-[var(--sf-muted)] outline-none focus:border-[var(--sf-foreground)] focus:ring-2 focus:ring-[var(--sf-focus)]/30";
const labelClass = "grid gap-2 text-sm font-semibold";

export function ContactForm({ deliveryConfigured, supportEmail }: { deliveryConfigured: boolean; supportEmail: string | null }) {
  const [state, action, pending] = useActionState(submitContactFormAction, initialState);

  if (!deliveryConfigured) {
    return (
      <div className="sf-status-warning mt-8 px-5 py-5 text-sm leading-6">
        <p className="font-semibold">Online messages are unavailable right now.</p>
        <p className="mt-2">This form is not accepting messages. Please call the front desk{supportEmail ? " or email us directly" : ""}.</p>
        {supportEmail ? <a className="mt-3 inline-flex font-semibold underline underline-offset-4" href={`mailto:${supportEmail}`}>Email {supportEmail}</a> : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 grid gap-5" noValidate>
      {state.status === "sent" ? <div role="status" className="sf-status-success px-4 py-3 text-sm">{state.message} Reference: <strong>{state.reference}</strong>.</div> : null}
      {state.status === "error" ? (
        <div role="alert" className="sf-status-error px-4 py-3 text-sm"><p>{state.message}</p>{supportEmail ? <a className="mt-2 inline-flex font-semibold underline underline-offset-4" href={`mailto:${supportEmail}`}>Email {supportEmail} directly</a> : null}</div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>First name<input name="firstName" required maxLength={100} className={inputClass} autoComplete="given-name" /></label>
        <label className={labelClass}>Last name<input name="lastName" required maxLength={100} className={inputClass} autoComplete="family-name" /></label>
      </div>
      <label className={labelClass}>Email<input name="email" required maxLength={254} className={inputClass} type="email" autoComplete="email" /></label>
      <label className={labelClass}>Phone <span className="font-normal text-[var(--sf-muted)]">Optional</span><input name="phone" maxLength={40} className={inputClass} type="tel" autoComplete="tel" /></label>
      <label className={labelClass}>Topic<select name="topic" className={inputClass}><option>Membership inquiry</option><option>Class information</option><option>Schedule a tour</option><option>General support</option></select></label>
      <label className={labelClass}>Message<textarea name="message" required maxLength={5000} className="min-h-40 w-full border border-[var(--sf-border-strong)] bg-[var(--sf-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--sf-foreground)] focus:ring-2 focus:ring-[var(--sf-focus)]/30" /></label>
      <button type="submit" disabled={pending} className="sf-btn-primary w-fit px-6 disabled:cursor-wait disabled:opacity-60">{pending ? "Sending..." : "Send message"}</button>
    </form>
  );
}
