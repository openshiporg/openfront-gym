import { NextRequest, NextResponse } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import { handleStripeWebhook } from "@/features/keystone/mutations/paymentWebhook";

// The Openfront payment-webhook path. Gym has one provider adapter (Stripe, code pp_stripe);
// the organization's provider is resolved from the verified signature, never from the URL.
const SUPPORTED_PROVIDERS = new Set(["pp_stripe"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  if (!SUPPORTED_PROVIDERS.has(providerId)) {
    return NextResponse.json({ error: "Unknown payment provider" }, { status: 404 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
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
