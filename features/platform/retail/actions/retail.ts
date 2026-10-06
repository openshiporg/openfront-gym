"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
export async function loadRetailWorkspace(skip = 0) {
  const result = await keystoneClient<{ retailWorkspace: any }>(`query Retail($skip: Int!) { retailWorkspace(skip: $skip) }`, { skip });
  if (!result.success) throw new Error(result.error); return result.data.retailWorkspace;
}
export async function retailAction(form: FormData): Promise<void> {
  const text = (name: string) => String(form.get(name) || "");
  const number = (name: string) => Number(text(name));
  const operation = text("operation");
  try {
    const ids = form.getAll("itemId").map(String), quantities = form.getAll("quantity").map(value => Number(value));
    const lines = ids.map((itemId, index) => ({ itemId, quantity: quantities[index], restock: form.get(`restock:${itemId}`) === "yes" })).filter(line => line.quantity > 0);
    const base = { locationId: text("locationId"), requestKey: text("requestKey") };
    let name: string; let data: any;
    if (operation === "item") { name = "saveRetailItem"; data = { ...base, name: text("name"), sku: text("sku"), unitAmount: number("unitAmount"), stockDelta: number("stockDelta"), isActive: text("isActive") !== "no", reason: text("reason") }; }
    else if (operation === "sale") {
      if (form.get("settled") !== "yes") throw new Error("Confirm cash or external payment was received before recording this sale");
      name = "sellRetail"; data = { ...base, lines, tender: text("tender"), settledAmount: number("settledAmount"), paymentReference: text("paymentReference") };
    } else if (operation === "return") {
      if (form.get("settled") !== "yes") throw new Error("Confirm the refund was handed back or settled externally");
      name = "returnRetail"; data = { ...base, saleId: text("saleId"), lines, reason: text("reason"), settledRefundAmount: number("settledRefundAmount"), refundReference: text("refundReference") };
    } else if (operation === "close") {
      name = "closeRetail"; data = { ...base, periodStart: `${text("periodStart")}Z`, periodEnd: `${text("periodEnd")}Z`, openingAmount: number("openingAmount"), countedAmount: number("countedAmount"), reason: text("reason") };
    } else throw new Error("Unknown retail operation");
    // The selected operation comes from the closed server-side map above.
    const result = await keystoneClient(`mutation RetailAction($data: JSON!) { ${name}(data: $data) }`, { data });
    if (!result.success) throw new Error(result.error);
  } catch (error) { redirect(`/dashboard/platform/retail?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to record retail action")}`); }
  revalidatePath("/dashboard/platform/retail"); redirect("/dashboard/platform/retail?success=Recorded");
}
