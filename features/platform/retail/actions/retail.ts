"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";
import { openStaffIntent, settleStaffIntent } from "@/features/platform/lib/staff-intent";

export async function loadRetailWorkspace(options: { skip?: number; cardSkip?: number; itemSkip?: number; itemSite?: string } = {}) {
  const bound = (value?: number) => Number.isSafeInteger(value) ? Math.min(Math.max(0, value as number), 100_000) : 0;
  const result = await keystoneClient<{ retailWorkspace: any }>(
    `query Retail($skip: Int!, $cardSkip: Int!, $itemSkip: Int!, $itemSite: ID) { retailWorkspace(skip: $skip, cardSkip: $cardSkip, itemSkip: $itemSkip, itemSite: $itemSite) }`,
    { skip: bound(options.skip), cardSkip: bound(options.cardSkip), itemSkip: bound(options.itemSkip), itemSite: options.itemSite || null },
  );
  if (!result.success) throw new Error(result.error); return result.data.retailWorkspace;
}

export type SaleItemsResult = { items: any[]; hasMore: boolean; skip: number } | { error: string };

/** Active items at one site for the counter cart (searched and paged on the server). */
export async function loadSaleItemsAction(locationId: string, q = "", skip = 0): Promise<SaleItemsResult> {
  const result = await keystoneClient<{ retailSaleItems: any }>(
    `query RetailSaleItems($locationId: ID!, $q: String, $skip: Int) { retailSaleItems(locationId: $locationId, q: $q, skip: $skip) }`,
    { locationId, q: q.slice(0, 100), skip: Math.min(Math.max(0, Math.trunc(skip) || 0), 100_000) },
  );
  return result.success ? result.data.retailSaleItems : { error: staffActionError(result, "Items couldn't be loaded. Try again.") };
}

export type QuoteResult = { quoteToken: string; lines: any[]; totalAmount: number; currencyCode: string; expiresAt: string } | { error: string };

/** Server-priced review of a cash or external sale, before any money is taken. */
export async function quoteRetailSaleAction(locationId: string, lines: Array<{ itemId: string; quantity: number }>): Promise<QuoteResult> {
  const result = await keystoneClient<{ quoteRetailSale: any }>(`mutation QuoteRetailSale($data: JSON!) { quoteRetailSale(data: $data) }`, { data: { locationId, lines } });
  return result.success ? result.data.quoteRetailSale : { error: staffActionError(result, "Prices couldn't be reviewed. Try again.") };
}

export async function retailAction(submitted: FormData): Promise<void> {
  let checkoutUrl: string | null = null;
  let message = "Recorded";
  let intentId = "";
  try {
    // The request is recorded before it is sent; a retry resends exactly that record.
    const intent = await openStaffIntent("retail", submitted);
    intentId = intent.id;
    const form = intent.form;
    const text = (name: string) => String(form.get(name) || "");
    const number = (name: string) => Number(text(name));
    const operation = text("operation");
    const ids = form.getAll("itemId").map(String), quantities = form.getAll("quantity").map(value => Number(value));
    const lines = ids.map((itemId, index) => ({ itemId, quantity: quantities[index], restock: form.get(`restock:${itemId}`) === "yes" })).filter(line => line.quantity > 0);
    const base = { locationId: text("locationId"), requestKey: intent.requestKey };
    let name: string; let data: any;
    if (operation === "item") { name = "saveRetailItem"; data = { ...base, name: text("name"), sku: text("sku"), unitAmount: number("unitAmount"), stockDelta: number("stockDelta"), isActive: text("isActive") !== "no", reason: text("reason") }; }
    else if (operation === "sale" && form.get("cardCheckout") === "yes") {
      name = "sellRetail"; data = { ...base, lines, mode: "startCard", reviewedTotal: number("reviewedTotal") };
    } else if (operation === "sale") {
      if (form.get("settled") !== "yes") throw new Error("Confirm cash or external payment was received before recording this sale");
      name = "sellRetail"; data = { ...base, lines, tender: text("tender"), settledAmount: number("settledAmount"), paymentReference: text("paymentReference"), quoteToken: text("quoteToken") };
    } else if (operation === "return") {
      if (form.get("settled") !== "yes") throw new Error("Confirm the refund was handed back or settled externally");
      name = "returnRetail"; data = { ...base, saleId: text("saleId"), lines, reason: text("reason"), settledRefundAmount: number("settledRefundAmount"), refundReference: text("refundReference") };
    } else if (operation === "close") {
      name = "closeRetail"; data = { ...base, periodStart: `${text("periodStart")}Z`, periodEnd: `${text("periodEnd")}Z`, openingAmount: number("openingAmount"), countedAmount: number("countedAmount"), reason: text("reason") };
    } else throw new Error("Unknown retail operation");
    // The selected operation comes from the closed server-side map above.
    const result = await keystoneClient<Record<string, any>>(`mutation RetailAction($data: JSON!) { ${name}(data: $data) }`, { data });
    if (!result.success) throw new Error(staffActionError(result, "Unable to record retail action. Refresh and try again."));
    checkoutUrl = data.mode === "startCard" ? result.data[name]?.checkoutUrl || null : null;
    if (data.mode === "startCard" && !checkoutUrl) throw new Error("Card checkout could not be opened. Try again.");
    if (operation === "sale" && !data.mode) {
      message = result.data[name]?.reconciliation
        ? `Payment kept for review: ${result.data[name].reason}. A manager will record the sale or refund it from Operations.`
        : "Sale recorded";
    }
    await settleStaffIntent(intentId, "succeeded");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to record retail action";
    if (intentId) await settleStaffIntent(intentId, "failed", reason);
    redirect(`/dashboard/platform/retail?error=${encodeURIComponent(reason)}${intentId ? `&intent=${encodeURIComponent(intentId)}` : ""}`);
  }
  // Staff hand the counter device to the customer; Stripe returns here with the checkout id.
  if (checkoutUrl) redirect(checkoutUrl);
  revalidatePath("/dashboard/platform/retail"); redirect(`/dashboard/platform/retail?success=${encodeURIComponent(message)}`);
}
