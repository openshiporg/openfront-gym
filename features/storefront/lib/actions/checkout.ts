"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { startMembershipCheckout } from "@/features/integrations/payment/membership-checkout";
import { CHECKOUT_RETURN_COOKIE } from "@/features/integrations/payment/membership-checkout-contract";
import { joinPath, safeStorefrontReturnPath } from "../return-path";
/** Customer redirect adapter; payment creation and authorization remain in the existing action. */
export async function checkoutReviewedPlan(data: FormData): Promise<void> {
  const cycle = data.get("billingCycle") === "annual" ? "annual" : "monthly";
  const requested = data.get("returnTo")?.toString();
  const returnTo = requested ? safeStorefrontReturnPath(requested) : null;
  const result = await startMembershipCheckout(data);
  if (!result.success) {
    const destination = new URL(joinPath(data.get("tierId")?.toString(), returnTo, cycle), "https://local.invalid");
    destination.searchParams.set("checkoutError", result.error);
    redirect(destination.pathname + destination.search);
  }
  const jar = await cookies();
  if (returnTo) jar.set(CHECKOUT_RETURN_COOKIE, returnTo, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800 });
  else jar.delete(CHECKOUT_RETURN_COOKIE);
  redirect(result.url);
}
