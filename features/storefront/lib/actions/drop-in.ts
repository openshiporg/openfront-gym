"use server";

import { gql } from "graphql-request";
import { redirect } from "next/navigation";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";

function publicMessage(error: unknown) {
  const raw = (error as any)?.response?.errors?.[0]?.message || (error instanceof Error ? error.message : "");
  return String(raw || "The drop-in checkout couldn't start. Try again or contact the club.").slice(0, 300);
}

/** Starts Stripe Checkout for one drop-in class; the browser is sent to the hosted payment page. */
export async function startDropInCheckoutAction(classInstanceId: string): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) return { success: false, error: "Sign in to book a drop-in class" };
    const result = await gymClient.request<{ startDropInCheckout: { checkoutUrl: string } }>(gql`
      mutation StartDropInCheckout($classInstanceId: ID!) {
        startDropInCheckout(classInstanceId: $classInstanceId) { checkoutUrl }
      }
    `, { classInstanceId }, headers);
    return { success: true, url: result.startDropInCheckout.checkoutUrl };
  } catch (error) {
    return { success: false, error: publicMessage(error) };
  }
}

export async function redirectToDropInCheckout(formData: FormData): Promise<void> {
  const classInstanceId = String(formData.get("classInstanceId") || "");
  const result = await startDropInCheckoutAction(classInstanceId);
  if (result.success) redirect(result.url);
  redirect(`/schedule?book=${encodeURIComponent(classInstanceId)}&dropInError=${encodeURIComponent(result.error)}`);
}

export async function completeDropInCheckoutAction(providerSessionId: string) {
  const headers = await getAuthHeaders();
  const result = await gymClient.request<{ completeDropInCheckout: { state: string; classInstanceId: string | null; bookingId: string | null; message: string | null } }>(gql`
    mutation CompleteDropInCheckout($providerSessionId: String!) {
      completeDropInCheckout(providerSessionId: $providerSessionId) { state classInstanceId bookingId message }
    }
  `, { providerSessionId }, headers);
  return result.completeDropInCheckout;
}
