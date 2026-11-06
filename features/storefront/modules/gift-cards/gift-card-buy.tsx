"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { buyGiftCardAction } from "@/features/storefront/lib/actions/gift-cards";
import { Banner } from "@/features/storefront/modules/common/ui";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function GiftCardBuy({ amounts }: { amounts: number[] }) {
  const [amount, setAmount] = useState(amounts[1] ?? amounts[0]);
  const [forSomeone, setForSomeone] = useState(true);
  const [state, action, pending] = useActionState(buyGiftCardAction, null);
  return (
    <form action={action} className="sf-form">
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="forSomeone" value={forSomeone ? "yes" : "no"} />
      <div className="sf-field">
        Amount
        <div className="sf-chips" role="group" aria-label="Gift card amount">
          {amounts.map((value) => (
            <button key={value} type="button" className="sf-chip" aria-pressed={value === amount} onClick={() => setAmount(value)}>{usd(value)}</button>
          ))}
        </div>
      </div>
      <div className="sf-field">
        Who is it for
        <div className="sf-seg" role="group" aria-label="Who is it for">
          <button type="button" aria-pressed={forSomeone} onClick={() => setForSomeone(true)}>Send to someone</button>
          <button type="button" aria-pressed={!forSomeone} onClick={() => setForSomeone(false)}>For me</button>
        </div>
      </div>
      <div className="sf-form-row">
        <label className="sf-field">Your name<input name="purchaserName" required maxLength={120} autoComplete="name" /></label>
        <label className="sf-field">Your email<input name="purchaserEmail" type="email" required maxLength={254} autoComplete="email" /></label>
      </div>
      {forSomeone ? (
        <>
          <div className="sf-form-row">
            <label className="sf-field">Their name<input name="recipientName" required maxLength={120} /></label>
            <label className="sf-field">Their email<input name="recipientEmail" type="email" required maxLength={254} /></label>
          </div>
          <label className="sf-field">Message (optional)<textarea name="message" maxLength={500} rows={3} /></label>
        </>
      ) : null}
      {state?.error ? <Banner tone="bad" role="alert">{state.error}</Banner> : null}
      <div className="sf-actions">
        <button type="submit" className="sf-btn" data-variant="accent" data-size="lg" disabled={pending}>
          {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
          {pending ? "Opening checkout…" : `Buy a ${usd(amount)} gift card`}
        </button>
      </div>
      <p className="sf-hint">Paid securely with Stripe. The code is emailed {forSomeone ? "to them" : "to you"} as soon as the payment clears, and works at the front desk for a year.</p>
    </form>
  );
}
