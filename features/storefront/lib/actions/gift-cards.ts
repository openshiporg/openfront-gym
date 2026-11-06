"use server";

import { gql } from "graphql-request";
import { redirect } from "next/navigation";
import { gymClient } from "@/features/storefront/lib/config";

export type GiftCardOrder = { status: string; amount: number; recipientName: string | null; recipientEmail: string | null; code: string | null; expiresAt: string | null };

function publicMessage(error: unknown) {
  const raw = (error as any)?.response?.errors?.[0]?.message || (error instanceof Error ? error.message : "");
  return String(raw || "Checkout couldn't open. Try again in a moment.").slice(0, 300);
}

export async function getGiftCardOptions(): Promise<{ online: boolean; amounts: number[] }> {
  try {
    const data = await gymClient.request<{ giftCardOptions: { online: boolean; amounts: number[] } }>(gql`query GiftCardOptions { giftCardOptions { online amounts } }`);
    return data.giftCardOptions;
  } catch {
    return { online: false, amounts: [] };
  }
}

/** Sends the buyer to Stripe Checkout; the card is issued once Stripe confirms the payment. */
export async function buyGiftCardAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const text = (key: string) => String(form.get(key) || "").trim();
  const forSomeone = text("forSomeone") === "yes";
  let url = "";
  try {
    const data = await gymClient.request<{ startGiftCardCheckout: { checkoutUrl: string } }>(gql`
      mutation StartGiftCardCheckout($amount: Int!, $name: String!, $email: String!, $toName: String, $toEmail: String, $message: String) {
        startGiftCardCheckout(amount: $amount, purchaserName: $name, purchaserEmail: $email, recipientName: $toName, recipientEmail: $toEmail, message: $message) { checkoutUrl }
      }
    `, {
      amount: Number(text("amount")), name: text("purchaserName"), email: text("purchaserEmail"),
      toName: forSomeone ? text("recipientName") || null : null, toEmail: forSomeone ? text("recipientEmail") || null : null, message: forSomeone ? text("message") || null : null,
    });
    url = data.startGiftCardCheckout.checkoutUrl;
  } catch (error) {
    return { error: publicMessage(error) };
  }
  if (!url.startsWith("https://checkout.stripe.com/")) return { error: "Checkout couldn't open. Try again in a moment." };
  redirect(url);
}

export async function confirmGiftCardOrder(ref: string, token: string): Promise<{ order: GiftCardOrder | null; error: string | null }> {
  try {
    const data = await gymClient.request<{ confirmGiftCardOrder: GiftCardOrder }>(gql`
      mutation ConfirmGiftCardOrder($ref: ID!, $token: String!) {
        confirmGiftCardOrder(ref: $ref, token: $token) { status amount recipientName recipientEmail code expiresAt }
      }
    `, { ref, token });
    return { order: data.confirmGiftCardOrder, error: null };
  } catch (error) {
    return { order: null, error: publicMessage(error) };
  }
}
