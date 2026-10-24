"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { submitContactFormAction, type ContactFormState } from "@/features/storefront/lib/actions/contact";
import { CONTACT_TOPICS } from "@/features/storefront/lib/contact-config";
import { Banner } from "@/features/storefront/modules/common/ui";

const initialState: ContactFormState = { status: "idle", message: null, reference: null };

export function ContactForm({
  topic,
  from,
  phone,
  supportEmail,
  defaults,
  sentNote = "Staff read messages in the club inbox and reply to the email address you entered. Keep this reference if you contact the club again.",
}: {
  topic?: string | null;
  from?: string | null;
  phone?: string | null;
  supportEmail?: string | null;
  defaults?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  /** What happens next, shown after the message is stored. */
  sentNote?: string;
}) {
  const [state, action, pending] = useActionState(submitContactFormAction, initialState);
  const selectedTopic = CONTACT_TOPICS.find((item) => item.key === topic)?.label ?? CONTACT_TOPICS[0].label;
  const fallback = phone
    ? <a className="sf-link" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>Call {phone}</a>
    : supportEmail ? <a className="sf-link" href={`mailto:${supportEmail}`}>Email {supportEmail}</a> : undefined;

  return (
    <form action={action} className="sf-form">
      {state.status === "sent" ? (
        <Banner tone="ok" title={state.message}>Reference {state.reference}. {sentNote}</Banner>
      ) : null}
      {state.status === "error" ? <Banner tone="bad" action={fallback}>{state.message}</Banner> : null}

      {from ? <input type="hidden" name="from" value={from} /> : null}
      <div className="sf-honeypot" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="sf-form-row">
        <label className="sf-field">First name<input name="firstName" required maxLength={100} autoComplete="given-name" defaultValue={defaults?.firstName} /></label>
        <label className="sf-field">Last name<input name="lastName" required maxLength={100} autoComplete="family-name" defaultValue={defaults?.lastName} /></label>
      </div>
      <div className="sf-form-row">
        <label className="sf-field">Email<input name="email" required maxLength={254} type="email" autoComplete="email" defaultValue={defaults?.email} /></label>
        <label className="sf-field">Phone (optional)<input name="phone" maxLength={40} type="tel" autoComplete="tel" defaultValue={defaults?.phone} /></label>
      </div>
      <label className="sf-field">Topic
        <select name="topic" defaultValue={selectedTopic}>
          {CONTACT_TOPICS.map((item) => <option key={item.key} value={item.label}>{item.label}</option>)}
        </select>
      </label>
      <label className="sf-field">Message<textarea name="message" required maxLength={5000} rows={6} /></label>
      <div>
        <button type="submit" disabled={pending} className="sf-btn" data-size="lg">
          {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
