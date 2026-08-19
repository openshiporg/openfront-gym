import type Stripe from "stripe";

export type BillingCycle = "monthly" | "annual";

export type MembershipCheckoutInput = {
  userId: string;
  userName: string;
  userEmail: string;
  tierId: string;
  billingCycle: BillingCycle;
  amount: number;
  currencyCode: string;
  priceId: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type MembershipPriceValidationInput = {
  priceId: string;
  productId?: string | null;
  amount: number;
  currencyCode: string;
  billingCycle: BillingCycle;
};

export type MembershipCheckoutResult = {
  providerSessionId: string;
  providerCustomerId: string;
  checkoutUrl: string;
  expiresAt: string | null;
};

export interface PaymentProviderAdapter {
  validateMembershipPrice(input: MembershipPriceValidationInput): Promise<void>;
  createMembershipCheckout(input: MembershipCheckoutInput): Promise<MembershipCheckoutResult>;
  retrieveMembershipCheckout(providerSessionId: string): Promise<Stripe.Checkout.Session>;
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  createSetupIntent(customerId: string): Promise<{ id: string; clientSecret: string | null }>;
  cancelSubscriptionAtPeriodEnd(subscriptionId: string, idempotencyKey?: string): Promise<Stripe.Subscription>;
  pauseSubscription(subscriptionId: string, resumeDate?: Date, idempotencyKey?: string): Promise<Stripe.Subscription>;
  resumeSubscription(subscriptionId: string, idempotencyKey?: string): Promise<Stripe.Subscription>;
  changeSubscriptionPrice(
    subscriptionId: string,
    priceId: string,
    metadata: { tierId: string; billingCycle: BillingCycle },
    idempotencyKey?: string,
  ): Promise<Stripe.Subscription>;
  createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  refundPayment(paymentIntentId: string, amount?: number, idempotencyKey?: string): Promise<Stripe.Refund>;
  constructWebhookEvent(payload: string, signature: string): Stripe.Event;
}
