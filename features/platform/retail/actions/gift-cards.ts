"use server";
import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

export type GiftCardLookup = { card: any } | { error: string };
export type GiftCardCommand = { ok: true; message: string } | { ok: false; error: string };

export async function loadGiftCards(skip = 0) {
  const result = await keystoneClient<{ giftCardsWorkspace: any }>(`query GiftCards($skip: Int!) { giftCardsWorkspace(skip: $skip) }`, { skip: Math.min(Math.max(0, Math.trunc(skip) || 0), 100_000) });
  return result.success ? result.data.giftCardsWorkspace : { cards: [], hasMore: false, skip: 0, error: staffActionError(result, "Gift cards couldn't be loaded.") };
}

export async function lookupGiftCardAction(code: string): Promise<GiftCardLookup> {
  const result = await keystoneClient<{ lookupGiftCard: any }>(`query LookupGiftCard($code: String!) { lookupGiftCard(code: $code) }`, { code: code.slice(0, 40) });
  return result.success ? { card: result.data.lookupGiftCard } : { error: staffActionError(result, "That code couldn't be checked. Try again.") };
}

export async function redeemGiftCardAction(input: { code: string; amount: number; note: string; requestKey: string }): Promise<GiftCardCommand> {
  const result = await keystoneClient<{ redeemGiftCard: any }>(
    `mutation RedeemGiftCard($code: String!, $amount: Int!, $requestKey: String!, $note: String!) { redeemGiftCard(code: $code, amount: $amount, requestKey: $requestKey, note: $note) }`,
    input,
  );
  if (!result.success) return { ok: false, error: staffActionError(result, "The gift card wasn't charged. Try again.") };
  revalidatePath("/dashboard/platform/retail");
  const balance = Number(result.data.redeemGiftCard?.balance ?? 0);
  return { ok: true, message: `Took ${money(input.amount)} from the card. ${money(balance)} left.` };
}

export async function refundGiftCardAction(giftCardId: string): Promise<GiftCardCommand> {
  const result = await keystoneClient<{ refundGiftCard: any }>(`mutation RefundGiftCard($id: ID!) { refundGiftCard(giftCardId: $id) }`, { id: giftCardId });
  if (!result.success) return { ok: false, error: staffActionError(result, "The refund didn't go through. Try again.") };
  revalidatePath("/dashboard/platform/retail");
  return { ok: true, message: "Refunded to the buyer's card. The gift card no longer works." };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
