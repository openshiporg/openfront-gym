"use server";
import { redirect } from "next/navigation";
import { settleStaffIntent } from "@/features/platform/lib/staff-intent";

const RETURN_PATHS = new Set(["/dashboard/platform/retail", "/dashboard/platform/training", "/dashboard/platform/billing", "/account/training"]);

/**
 * Discards a retained request the person has confirmed was not recorded, so the form can start a
 * new one. Refused while a card payment the request opened is still unsettled.
 */
export async function discardStaffIntentAction(form: FormData): Promise<void> {
  const returnTo = String(form.get("returnTo") || "");
  const path = RETURN_PATHS.has(returnTo) ? returnTo : "/dashboard";
  let error = "";
  try {
    await settleStaffIntent(String(form.get("intentId") || ""), "abandoned");
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "The request couldn't be discarded";
  }
  redirect(error ? `${path}?error=${encodeURIComponent(error)}&intent=${encodeURIComponent(String(form.get("intentId") || ""))}` : `${path}?success=${encodeURIComponent("Discarded. You can start a new request.")}`);
}
