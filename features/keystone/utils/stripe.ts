import Stripe from "stripe";

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Stripe secret key not configured. Set STRIPE_SECRET_KEY in environment variables.");
  }
  return new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
  });
};

export const stripe = getStripeClient();

export async function createCustomer({ email, name }: { email: string; name: string }) {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      source: "openfront-gym",
    },
  });

  return customer;
}

export async function createSubscription({
  customerId,
  priceId,
  paymentMethodId,
}: {
  customerId: string;
  priceId: string;
  paymentMethodId?: string;
}) {
  const stripe = getStripeClient();

  // Attach payment method if provided
  if (paymentMethodId) {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });

  return subscription;
}

export async function createSetupIntent(customerId: string) {
  const stripe = getStripeClient();

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
  });

  return setupIntent;
}

export async function cancelSubscription(subscriptionId: string) {
  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.cancel(subscriptionId);

  return subscription;
}

export async function pauseSubscription(subscriptionId: string, resumeDate?: Date) {
  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: resumeDate ? Math.floor(resumeDate.getTime() / 1000) : undefined,
    },
  });

  return subscription;
}

export async function resumeSubscription(subscriptionId: string) {
  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    pause_collection: null,
  });

  return subscription;
}

export async function updateSubscription({
  subscriptionId,
  newPriceId,
}: {
  subscriptionId: string;
  newPriceId: string;
}) {
  const stripe = getStripeClient();

  // Get current subscription
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update to new price
  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: "create_prorations",
  });

  return updated;
}

export async function getSubscription(subscriptionId: string) {
  const stripe = getStripeClient();

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice", "default_payment_method"],
  });

  return subscription;
}

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

export async function constructWebhookEvent(payload: string, signature: string) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("Stripe webhook secret not configured");
  }

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

  return event;
}

export default stripe;
