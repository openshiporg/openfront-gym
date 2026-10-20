"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { startMembershipCheckout } from "@/features/integrations/payment/membership-checkout";
import { CHECKOUT_CYCLE_COOKIE, CHECKOUT_RETURN_COOKIE } from "@/features/integrations/payment/membership-checkout-contract";
import { joinPath, safeStorefrontReturnPath } from "../return-path";
import { getAuthHeaders } from "../data/cookies";
import { recordParticipationAcceptance } from "../data/participation";
/** Customer redirect adapter; payment creation and authorization remain in the existing action. */
export async function checkoutReviewedPlan(data: FormData): Promise<void> {
  const cycle = data.get("billingCycle") === "annual" ? "annual" : "monthly";
  const requested = data.get("returnTo")?.toString();
  const returnTo = requested ? safeStorefrontReturnPath(requested) : null;
  // Participation terms shown on the checkout form are accepted before payment starts.
  const termsPolicyId = data.get("termsPolicyId")?.toString().slice(0, 200);
  const acceptance = !termsPolicyId ? null : data.get("acceptTerms") !== "on"
    ? "Accept the participation terms to continue."
    : await recordParticipationAcceptance(termsPolicyId, await getAuthHeaders()).then(() => null, () => "Your acceptance of the participation terms wasn't saved. Refresh and try again.");
  const result = acceptance ? { success: false as const, error: acceptance } : await startMembershipCheckout(data);
  if (!result.success) {
    const destination = new URL(joinPath(data.get("tierId")?.toString(), returnTo, cycle), "https://local.invalid");
    destination.searchParams.set("checkoutError", result.error);
    redirect(destination.pathname + destination.search);
  }
  const jar = await cookies();
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800 };
  if (returnTo) jar.set(CHECKOUT_RETURN_COOKIE, returnTo, cookieOptions);
  else jar.delete(CHECKOUT_RETURN_COOKIE);
  jar.set(CHECKOUT_CYCLE_COOKIE, cycle, cookieOptions);
  redirect(result.url);
}
