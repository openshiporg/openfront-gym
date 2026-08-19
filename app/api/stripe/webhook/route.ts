import { NextRequest, NextResponse } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import { handleStripeWebhook } from "@/features/keystone/mutations/paymentWebhook";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await request.text();
  try {
    const result = await handleStripeWebhook(keystoneContext as any, payload, signature);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    const isSignatureError = /signature|payload/i.test(message);
    console.error("Stripe webhook processing error", {
      name: error instanceof Error ? error.name : "UnknownError",
      signatureFailure: isSignatureError,
    });
    return NextResponse.json({ error: message }, { status: isSignatureError ? 400 : 500 });
  }
}
