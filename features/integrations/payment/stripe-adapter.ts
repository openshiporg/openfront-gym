import Stripe from "stripe";
import type { MembershipPriceValidationInput, PaymentProviderAdapter } from "./types";

function getStripeClient() {
  if (process.env.STRIPE_ENABLED !== "true") {
    throw new Error("Stripe checkout is disabled for this Gym deployment.");
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe secret key not configured.");
  return new Stripe(secretKey, { apiVersion: "2023-10-16" });
}

async function ensureCustomer(input: {
  customerId?: string | null;
  userId: string;
  userName: string;
  userEmail: string;
}) {
  if (input.customerId) return input.customerId;

  const customer = await getStripeClient().customers.create(
    {
      email: input.userEmail,
      name: input.userName,
      metadata: { source: "openfront-gym", userId: input.userId },
    },
    { idempotencyKey: `gym-customer:${input.userId}` }
  );
  return customer.id;
}

export function assertStripeMembershipPrice(
  price: Stripe.Price,
  input: MembershipPriceValidationInput,
) {
  const expectedInterval = input.billingCycle === "annual" ? "year" : "month";
  const productId = typeof price.product === "string" ? price.product : price.product?.id;
  const productActive = Boolean(
    typeof price.product === "object" &&
    price.product &&
    !("deleted" in price.product && price.product.deleted) &&
    "active" in price.product &&
    price.product.active,
  );
  const valid =
    productActive &&
    price.active &&
    price.type === "recurring" &&
    price.recurring?.interval === expectedInterval &&
    price.recurring?.interval_count === 1 &&
    price.unit_amount === input.amount &&
    price.currency.toUpperCase() === input.currencyCode.toUpperCase() &&
    (!input.productId || productId === input.productId);
  if (!valid) {
    throw new Error(
      `Stripe ${input.billingCycle} Price must be active, recurring once per ${expectedInterval}, and match the configured plan amount, currency, and product.`,
    );
  }
}

export const stripePaymentProviderAdapter: PaymentProviderAdapter = {
  async validateMembershipPrice(input) {
    const price = await getStripeClient().prices.retrieve(input.priceId, {
      expand: ["product"],
    });
    assertStripeMembershipPrice(price, input);
  },

  async createMembershipCheckout(input) {
    const stripe = getStripeClient();
    const customerId = await ensureCustomer(input);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: input.idempotencyKey,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          source: "openfront-gym",
          paymentSessionKey: input.idempotencyKey,
          userId: input.userId,
          tierId: input.tierId,
          billingCycle: input.billingCycle,
          amount: String(input.amount),
          currencyCode: input.currencyCode,
        },
        subscription_data: {
          metadata: {
            source: "openfront-gym",
            paymentSessionKey: input.idempotencyKey,
            userId: input.userId,
            tierId: input.tierId,
            billingCycle: input.billingCycle,
          },
        },
      },
      { idempotencyKey: input.idempotencyKey }
    );

    if (!session.url) throw new Error("Stripe checkout did not return a redirect URL.");
    return {
      providerSessionId: session.id,
      providerCustomerId: customerId,
      checkoutUrl: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    };
  },

  retrieveMembershipCheckout(providerSessionId) {
    return getStripeClient().checkout.sessions.retrieve(providerSessionId, {
      expand: ["subscription", "customer"],
    });
  },

  retrieveSubscription(subscriptionId) {
    return getStripeClient().subscriptions.retrieve(subscriptionId);
  },

  async createSetupIntent(customerId) {
    const intent = await getStripeClient().setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });
    return { id: intent.id, clientSecret: intent.client_secret };
  },

  cancelSubscriptionAtPeriodEnd(subscriptionId, idempotencyKey) {
    return getStripeClient().subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  },

  pauseSubscription(subscriptionId, resumeDate, idempotencyKey) {
    return getStripeClient().subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: "void",
        resumes_at: resumeDate ? Math.floor(resumeDate.getTime() / 1000) : undefined,
      },
    }, idempotencyKey ? { idempotencyKey } : undefined);
  },

  resumeSubscription(subscriptionId, idempotencyKey) {
    return getStripeClient().subscriptions.update(subscriptionId, { pause_collection: null }, idempotencyKey ? { idempotencyKey } : undefined);
  },

  async changeSubscriptionPrice(subscriptionId, priceId, metadata, idempotencyKey) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) throw new Error("Stripe subscription has no active line item.");
    return stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
      metadata: {
        tierId: metadata.tierId,
        billingCycle: metadata.billingCycle,
      },
    }, idempotencyKey ? { idempotencyKey } : undefined);
  },

  async createBillingPortalSession(customerId, returnUrl) {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },

  refundPayment(paymentIntentId, amount, idempotencyKey) {
    return getStripeClient().refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amount ? { amount } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );
  },

  constructWebhookEvent(payload, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Stripe webhook secret not configured.");
    return getStripeClient().webhooks.constructEvent(payload, signature, secret);
  },
};
