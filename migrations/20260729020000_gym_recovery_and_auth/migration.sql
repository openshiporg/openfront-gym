-- Safe expand migration for durable onboarding leases, payment recovery state,
-- provider-account webhook routing, and shared auth throttling.
ALTER TABLE "OnboardingRun"
  ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leaseToken" TEXT NOT NULL DEFAULT '';

ALTER TABLE "GymPayment"
  ADD COLUMN IF NOT EXISTS "refundLockUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundLockToken" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "billingOperationKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "billingOperation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "billingOperationStatus" TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "billingOperationLeaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingOperationError" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PaymentProvider"
  ADD COLUMN IF NOT EXISTS "providerAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymentProvider_providerAccountId_idx"
  ON "PaymentProvider"("providerAccountId");

DROP INDEX IF EXISTS "PaymentEvent_providerEventId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvent_provider_event_key"
  ON "PaymentEvent"("paymentProvider", "providerEventId");

CREATE TABLE IF NOT EXISTS "AuthRateLimitBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3),
  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthRateLimitBucket_key"
  ON "AuthRateLimitBucket"("key");
