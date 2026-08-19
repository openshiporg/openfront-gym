"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { gql } from "graphql-request";
import { gymClient } from "../../storefront/lib/config";
import { getAuthHeaders } from "../../storefront/lib/data/cookies";
import type { BillingCycle } from "./types";
import {
  CHECKOUT_RETURN_COOKIE,
  publicCheckoutError,
  type CheckoutResult,
} from "./membership-checkout-contract";
import { safeStorefrontReturnPath } from "../../storefront/lib/return-path";

export async function startMembershipCheckout(formData: FormData): Promise<CheckoutResult> {
  try {
    const tierId = formData.get("tierId")?.toString();
    const billingCycle: BillingCycle = formData.get("billingCycle")?.toString() === "annual" ? "annual" : "monthly";
    if (!tierId) return { success: false, error: "No membership tier selected." };
    const headers = await getAuthHeaders();
    const result = await gymClient.request<{
      initiateMembershipCheckout: { id: string; checkoutUrl: string };
    }>(gql`
      mutation StartMembershipCheckout($tierId: ID!, $billingCycle: String!) {
        initiateMembershipCheckout(tierId: $tierId, billingCycle: $billingCycle) {
          id checkoutUrl
        }
      }
    `, { tierId, billingCycle }, headers);
    return {
      success: true,
      url: result.initiateMembershipCheckout.checkoutUrl,
      paymentSessionId: result.initiateMembershipCheckout.id,
    };
  } catch (error) {
    return { success: false, error: publicCheckoutError(error) };
  }
}

export async function completeMembershipCheckoutAction(providerSessionId: string) {
  const headers = await getAuthHeaders();
  const result = await gymClient.request<{
    completeMembershipCheckout: { tierName: string; billingCycle: string };
  }>(gql`
    mutation CompleteMembershipCheckout($providerSessionId: String!) {
      completeMembershipCheckout(providerSessionId: $providerSessionId) { tierName billingCycle }
    }
  `, { providerSessionId }, headers);
  return result.completeMembershipCheckout;
}

export async function clearCheckoutReturnAndRedirect(formData: FormData): Promise<void> {
  const destination = safeStorefrontReturnPath(formData.get("destination")?.toString());
  (await cookies()).delete(CHECKOUT_RETURN_COOKIE);
  redirect(destination);
}

export async function redirectToMembershipCheckout(formData: FormData): Promise<void> {
  const requestedReturnTo = formData.get("returnTo")?.toString();
  const returnTo = requestedReturnTo
    ? safeStorefrontReturnPath(requestedReturnTo)
    : null;
  const result = await startMembershipCheckout(formData);
  if (result.success) {
    const cookieStore = await cookies();
    if (returnTo) {
      cookieStore.set(CHECKOUT_RETURN_COOKIE, returnTo, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 60,
      });
    } else {
      cookieStore.delete(CHECKOUT_RETURN_COOKIE);
    }
    redirect(result.url);
  }
  const params = new URLSearchParams();
  const tierId = formData.get("tierId")?.toString();
  if (tierId) params.set("tier", tierId);
  if (returnTo) params.set("returnTo", returnTo);
  params.set("checkoutError", result.error);
  redirect(`/join?${params.toString()}`);
}
