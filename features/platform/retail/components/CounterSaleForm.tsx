"use client";
import { useState, useTransition } from "react";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckField, DataTable, EmptyBlock, FieldInput, FormField, NativeSelect, Notice, Td, Th, Tr } from "@/features/platform/components/platform-ui";
import type { QuoteResult, SaleItemsResult } from "../actions/retail";

type Item = { id: string; name: string; sku: string; locationId: string; unitAmount: number; stockOnHand: number; isActive: boolean };
type Site = { id: string; name: string; isActive: boolean };
type Quote = Extract<QuoteResult, { quoteToken: string }>;

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

/**
 * Counter cart for one site. Items come from the server for the chosen site (searchable, paged),
 * so every item is reachable. A cash or external sale is priced by the server first: staff see
 * the reviewed lines and total, take that amount, then record it against that review. Card sales
 * open Stripe checkout with the server's own frozen quote.
 */
export function CounterSaleForm({ action, loadItems, quote: requestQuote, locations, requestKey }: {
  action: (form: FormData) => Promise<void>;
  loadItems: (locationId: string, q?: string, skip?: number) => Promise<SaleItemsResult>;
  quote: (locationId: string, lines: Array<{ itemId: string; quantity: number }>) => Promise<QuoteResult>;
  locations: Site[];
  requestKey: string;
}) {
  const [locationId, setLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<{ items: Item[]; hasMore: boolean; skip: number } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<Record<string, { item: Item; quantity: number }>>({});
  const [tender, setTender] = useState("cash");
  const [review, setReview] = useState<Quote | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [pending, startTransition] = useTransition();

  const fetchItems = (site: string, q: string, skip: number) => {
    if (!site) { setPage(null); return; }
    startTransition(async () => {
      const result = await loadItems(site, q, skip);
      if ("error" in result) { setLoadError(result.error); setPage(null); return; }
      setLoadError("");
      setPage({ items: result.items, hasMore: result.hasMore, skip: result.skip });
    });
  };
  const chooseSite = (site: string) => {
    setLocationId(site); setQuery(""); setCart({}); setReview(null);
    fetchItems(site, "", 0);
  };

  const lines = Object.values(cart).filter((line) => line.quantity > 0);
  const total = lines.reduce((sum, line) => sum + line.item.unitAmount * line.quantity, 0);
  const overStock = lines.some((line) => line.quantity > line.item.stockOnHand);
  const setQuantity = (item: Item, quantity: number) => {
    setReview(null);
    setCart((current) => ({ ...current, [item.id]: { item, quantity } }));
  };
  const reviewPrices = () => {
    setReviewError("");
    startTransition(async () => {
      const result = await requestQuote(locationId, lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })));
      if ("error" in result) { setReview(null); setReviewError(result.error); return; }
      setReview(result);
    });
  };
  const reviewed = review && new Date(review.expiresAt).getTime() > Date.now() ? review : null;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="operation" value="sale" />
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="reviewedTotal" value={total} />
      {reviewed ? <input type="hidden" name="quoteToken" value={reviewed.quoteToken} /> : null}
      <input type="hidden" name="settledAmount" value={reviewed ? reviewed.totalAmount : ""} />
      {lines.map((line) => (
        <span key={line.item.id} hidden>
          <input type="hidden" name="itemId" value={line.item.id} />
          <input type="hidden" name="quantity" value={line.quantity} />
        </span>
      ))}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-end">
        <FormField label="Location">
          <NativeSelect name="locationId" required value={locationId} onChange={(event) => chooseSite(event.target.value)}>
            <option value="">Select a location</option>
            {locations.filter((site) => site.isActive).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </NativeSelect>
        </FormField>
        {locationId ? (
          <div className="flex gap-2">
            <FieldInput aria-label="Search items at this location" placeholder="Search by name or SKU" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); fetchItems(locationId, query, 0); } }} />
            <Button type="button" variant="outline" onClick={() => fetchItems(locationId, query, 0)} disabled={pending}>Search</Button>
          </div>
        ) : null}
      </div>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {!locationId ? (
        <EmptyBlock compact icon={Boxes} title="Choose the selling location" description="Only items stocked at one site can be sold together." className="rounded-lg border border-dashed" />
      ) : !page ? (
        <p className="text-xs text-muted-foreground" role="status">{pending ? "Loading items…" : "Items couldn't be loaded."}</p>
      ) : page.items.length === 0 && lines.length === 0 ? (
        <EmptyBlock compact icon={Boxes} title={query ? "No items match" : "No active items at this location"} description={query ? undefined : "Add catalog items below before recording a sale."} className="rounded-lg border border-dashed" />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <DataTable label="Items for sale" minWidth="36rem">
            <thead>
              <tr><Th>Item</Th><Th align="right">Price</Th><Th align="right">In stock</Th><Th align="right" className="w-28">Quantity</Th><Th align="right">Line total</Th></tr>
            </thead>
            <tbody>
              {[...lines.map((line) => line.item).filter((item) => !page.items.some((row) => row.id === item.id)), ...page.items].map((item) => {
                const quantity = cart[item.id]?.quantity || 0;
                return (
                  <Tr key={item.id}>
                    <Td><p className="font-medium">{item.name}</p><p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p></Td>
                    <Td align="right">{money(item.unitAmount)}</Td>
                    <Td align="right" className={item.stockOnHand > 0 ? "" : "text-amber-700 dark:text-amber-400"}>{item.stockOnHand}</Td>
                    <Td align="right">
                      <FieldInput aria-label={`Quantity of ${item.name}`} type="number" min={0} max={Math.max(0, item.stockOnHand)} step={1} value={quantity}
                        onChange={(event) => setQuantity(item, Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className="ml-auto w-20 text-right tabular-nums" />
                    </Td>
                    <Td align="right" className={quantity ? "font-medium" : "text-muted-foreground"}>{money(item.unitAmount * quantity)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t bg-muted/30 px-4 py-3 sm:px-5">
            <span className="text-sm text-muted-foreground">{lines.length ? `${lines.reduce((sum, line) => sum + line.quantity, 0)} selected · taxes not calculated` : "No items selected"}</span>
            <span className="flex items-center gap-3">
              {page.skip > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => fetchItems(locationId, query, Math.max(0, page.skip - 100))}>Previous items</Button> : null}
              {page.hasMore ? <Button type="button" variant="ghost" size="sm" onClick={() => fetchItems(locationId, query, page.skip + 100)}>More items</Button> : null}
              <span className="text-base font-semibold tabular-nums">Total {money(total)}</span>
            </span>
          </div>
        </div>
      )}
      {overStock ? <p className="text-xs text-amber-700 dark:text-amber-400" role="status">A quantity is above the stock on hand; the sale will be rejected.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tender for cash or external payment" hint="For cards, use Take card payment instead.">
          <NativeSelect name="tender" value={tender} onChange={(event) => setTender(event.target.value)}>
            <option value="cash">Cash received</option>
            <option value="external">External payment settled</option>
          </NativeSelect>
        </FormField>
        {tender === "external" ? (
          <FormField label="External payment reference"><FieldInput name="paymentReference" required /></FormField>
        ) : null}
      </div>
      {reviewError ? <Notice tone="danger">{reviewError}</Notice> : null}
      {reviewed ? (
        <Notice tone="info" title={`Reviewed total ${money(reviewed.totalAmount)}`}>
          {reviewed.lines.map((line: any) => `${line.quantity} × ${line.name} at ${money(line.unitAmount)}`).join(" · ")}. Valid until {new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(reviewed.expiresAt))}.
        </Notice>
      ) : null}
      {reviewed ? (
        <CheckField name="settled" value="yes" required confirm>
          {tender === "cash"
            ? `I received ${money(reviewed.totalAmount)} in cash for these items (after change).`
            : `I verified the external settlement of ${money(reviewed.totalAmount)} for these items.`}
        </CheckField>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" variant="outline" name="cardCheckout" value="yes" formNoValidate disabled={total <= 0 || pending}>
          Take card payment · {money(total)}
        </Button>
        {reviewed ? (
          <Button type="submit" disabled={pending}>Record {money(reviewed.totalAmount)} {tender === "cash" ? "cash" : "external"} sale</Button>
        ) : (
          <Button type="button" onClick={reviewPrices} disabled={total <= 0 || overStock || pending}>Review prices before taking payment</Button>
        )}
      </div>
    </form>
  );
}
