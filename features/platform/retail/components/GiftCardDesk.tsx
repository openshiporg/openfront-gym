"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldInput, FormField, Notice } from "@/features/platform/components/platform-ui";
import { lookupGiftCardAction, redeemGiftCardAction, refundGiftCardAction } from "../actions/gift-cards";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
const STATUS: Record<string, string> = { active: "Active", redeemed: "Used up", voided: "Refunded" };

/** Front desk: check a code, take an amount from it as payment, or refund an unused card. */
export function GiftCardDesk() {
  const [code, setCode] = useState("");
  const [card, setCard] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  const look = (value = code) => start(async () => {
    setError(""); setDone("");
    const result = await lookupGiftCardAction(value);
    if ("error" in result) { setCard(null); setError(result.error); return; }
    setCard(result.card);
  });
  const cents = Math.round(Number(amount) * 100);
  const redeem = () => start(async () => {
    setError(""); setDone("");
    const result = await redeemGiftCardAction({ code: card.code, amount: cents, note, requestKey });
    if (!result.ok) { setError(result.error); return; }
    setDone(result.message); setAmount(""); setNote(""); setRequestKey(crypto.randomUUID());
    const fresh = await lookupGiftCardAction(card.code);
    if (!("error" in fresh)) setCard(fresh.card);
  });
  const refund = () => start(async () => {
    if (!window.confirm(`Refund ${money(card.initialValue)} to the buyer's card? The code stops working.`)) return;
    setError(""); setDone("");
    const result = await refundGiftCardAction(card.id);
    if (!result.ok) { setError(result.error); return; }
    setDone(result.message);
    const fresh = await lookupGiftCardAction(card.code);
    if (!("error" in fresh)) setCard(fresh.card);
  });

  return (
    <div className="grid gap-4">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); look(); }}>
        <FormField label="Gift card code" className="sm:w-72">
          <FieldInput value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} className="font-mono uppercase" />
        </FormField>
        <Button type="submit" variant="outline" disabled={pending || !code.trim()}>Check balance</Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="positive">{done}</Notice> : null}
      {card ? (
        <div className="grid gap-4 rounded-lg border p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Code</dt><dd className="font-mono">{card.code}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className="font-semibold tabular-nums">{money(card.balance)} of {money(card.initialValue)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{STATUS[card.status] || card.status}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Valid until</dt><dd>{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No expiry"}</dd></div>
          </dl>
          {card.status === "active" ? (
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <FormField label="Amount (USD)"><FieldInput type="number" min="0.01" step="0.01" max={card.balance / 100} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></FormField>
              <FormField label="Paid for"><FieldInput value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="Drop-in class, water bottle…" /></FormField>
              <Button type="button" onClick={redeem} disabled={pending || !(cents > 0) || cents > card.balance || !note.trim()}>Take {cents > 0 ? money(cents) : "payment"}</Button>
            </div>
          ) : null}
          {Array.isArray(card.ledger) && card.ledger.length ? (
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {card.ledger.slice().reverse().map((row: any, index: number) => (
                <li key={index} className="flex justify-between gap-3 tabular-nums">
                  <span>{new Date(row.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {row.type === "issue" ? "Bought online" : row.type === "void" ? "Refunded" : row.note || "Redeemed"}</span>
                  <span>{row.type === "issue" ? "+" : "−"}{money(row.amount)} · {money(row.balance)} left</span>
                </li>
              ))}
            </ul>
          ) : null}
          {card.status === "active" && card.balance === card.initialValue ? (
            <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={refund} disabled={pending}>Refund unused card</Button></div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
