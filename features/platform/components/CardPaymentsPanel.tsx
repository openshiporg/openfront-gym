import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { counterPaymentAction } from "@/features/platform/lib/counter-payment-action";
import { formatMinorUnits } from "@/features/platform/lib/currency";
import { EmptyBlock, Notice, Panel, PanelHeader, StatusPill, humanize, type Tone } from "./platform-ui";

type Row = {
  id: string; purpose: string; status: string; amount: number; currencyCode: string; summary: string;
  checkoutUrl: string | null; lastError: string; createdAt: string; expiresAt: string | null; retried?: boolean;
};

const LABEL: Record<string, string> = {
  reserved: "Held, checkout not opened",
  open: "Waiting for card",
  fulfilled: "Paid and recorded",
  released: "Released",
  exception: "Paid, not recorded",
  compensating: "Paid, refund in progress",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  refund_failed: "Refund failed",
};

function tone(status: string): Tone {
  if (status === "fulfilled" || status === "refunded") return "positive";
  if (status === "exception" || status === "refund_failed") return "danger";
  if (status === "released") return "neutral";
  return "warning";
}

function ActionButton({ row, surface, action, label, variant = "outline" }: { row: Row; surface: "retail" | "training"; action: string; label: string; variant?: "outline" | "destructive" | "default" }) {
  return (
    <form action={counterPaymentAction}>
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="attemptId" value={row.id} />
      <input type="hidden" name="action" value={action} />
      <Button type="submit" size="sm" variant={variant}>{label}</Button>
    </form>
  );
}

/**
 * Counter card payments that still need staff attention, plus the last week's outcomes. A checkout
 * holds stock or package terms until Stripe confirms payment; nothing is recorded as paid before that.
 */
export function CardPaymentsPanel({ rows, surface, timeZone, returnedCheckout, closedCheckout = false, olderHref = null, newerHref = null }: { rows: Row[]; surface: "retail" | "training"; timeZone: string; returnedCheckout?: string; closedCheckout?: boolean; olderHref?: string | null; newerHref?: string | null }) {
  const when = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  const attention = rows.filter(row => ["reserved", "open", "exception", "compensating", "refund_pending", "refund_failed"].includes(row.status));
  return (
    <Panel id="card-payments">
      <PanelHeader
        icon={CreditCard}
        title="Card payments"
        count={attention.length}
        description={surface === "retail"
          ? "Card sales hold their items until Stripe confirms payment; the sale is recorded from the paid checkout."
          : "Card packages are issued only after Stripe confirms payment, with the terms fixed when checkout opened."}
      />
      {returnedCheckout ? (
        <div className="border-b px-4 py-3 sm:px-5">
          <Notice tone="info" title="Card checkout returned" action={
            <form action={counterPaymentAction}>
              <input type="hidden" name="surface" value={surface} />
              <input type="hidden" name="checkoutSessionId" value={returnedCheckout} />
              <input type="hidden" name="action" value="status" />
              <Button type="submit" size="sm">Check payment</Button>
            </form>
          }>
            Gym checks the payment with Stripe before recording it. Stripe also notifies Gym on its own, so this may already be done.
          </Notice>
        </div>
      ) : null}
      {closedCheckout ? (
        <div className="border-b px-4 py-3 sm:px-5">
          <Notice tone="warning" title="Checkout closed without payment">
            The hold stays until the checkout expires. Reopen it for the customer, or cancel it to release the hold now.
          </Notice>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyBlock compact icon={CreditCard} title={newerHref ? "No older card payments" : "No card payments need attention, and none in the last 7 days"} />
      ) : (
        <ul className="divide-y">
          {rows.map(row => (
            <li key={row.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tabular-nums">{formatMinorUnits(row.amount, row.currencyCode)}</p>
                  <StatusPill tone={tone(row.status)}>{LABEL[row.status] || humanize(row.status)}</StatusPill>
                  {row.purpose.endsWith("refund") ? <span className="text-xs text-muted-foreground">Refund</span> : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary || "Card payment"} · {when(row.createdAt)}</p>
                {row.lastError && row.status !== "fulfilled" && row.status !== "refunded" ? <p className="mt-1 text-xs text-muted-foreground">{row.lastError}</p> : null}
                {row.status === "refund_failed" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.retried ? "A later refund replaced this one."
                      : row.purpose === "exception_refund" ? "Stripe confirmed nothing was refunded. The payment is back under Paid, not recorded: refund it again or retry recording there."
                      : row.purpose === "training_refund" ? "Stripe confirmed nothing was refunded and the credits were restored. Start the refund again from the package."
                      : "Stripe confirmed nothing was refunded. Start the return again from the sale."}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {row.status === "open" && row.checkoutUrl ? <Button asChild size="sm"><a href={row.checkoutUrl}>Open checkout</a></Button> : null}
                {row.status === "reserved" ? <ActionButton row={row} surface={surface} action="open" label="Open checkout" variant="default" /> : null}
                {row.status === "open" || row.status === "refund_pending" || row.status === "compensating" ? <ActionButton row={row} surface={surface} action="status" label="Check with Stripe" /> : null}
                {row.status === "reserved" || row.status === "open" ? <ActionButton row={row} surface={surface} action="cancel" label="Cancel and release" /> : null}
                {row.status === "exception" ? <ActionButton row={row} surface={surface} action="retry" label="Retry recording" variant="default" /> : null}
                {row.status === "exception" ? <ActionButton row={row} surface={surface} action="refund" label="Refund to card" variant="destructive" /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {olderHref || newerHref ? (
        <div className="flex justify-between border-t px-4 py-2 text-xs sm:px-5">
          {newerHref ? <a className="underline" href={newerHref}>Newer card payments</a> : <span />}
          {olderHref ? <a className="underline" href={olderHref}>Older card payments</a> : <span />}
        </div>
      ) : null}
    </Panel>
  );
}
