-- Preserve the cumulative refund observed when each operator attempt starts so
-- a webhook that arrives before the provider response cannot be counted twice.
ALTER TABLE "GymRefundAttempt"
  ADD COLUMN "startingRefundAmount" INTEGER NOT NULL DEFAULT 0;

-- Fence every provider billing worker across operation/key boundaries and keep
-- a durable high-water mark for signed Stripe subscription events.
ALTER TABLE "Membership"
  ADD COLUMN "billingGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription"
  ADD COLUMN "providerEventCreated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerEventId" TEXT NOT NULL DEFAULT '';

-- Replace the single mutable Membership billing slot with durable, scoped
-- attempts. This table is created and backfilled before the legacy slot is
-- removed so delayed pre-migration keys fail safely instead of re-executing.
CREATE TABLE "MembershipBillingAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "membership" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipBillingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipBillingAttempt_organization_idx"
  ON "MembershipBillingAttempt"("organization");
CREATE INDEX "MembershipBillingAttempt_membership_idx"
  ON "MembershipBillingAttempt"("membership");
CREATE INDEX "MembershipBillingAttempt_membership_status_lease"
  ON "MembershipBillingAttempt"("membership", "status", "leaseUntil");
CREATE UNIQUE INDEX "MembershipBillingAttempt_scope_operation_key"
  ON "MembershipBillingAttempt"("organization", "membership", "operation", "idempotencyKey");

ALTER TABLE "MembershipBillingAttempt"
  ADD CONSTRAINT "MembershipBillingAttempt_organization_fkey"
  FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipBillingAttempt"
  ADD CONSTRAINT "MembershipBillingAttempt_membership_fkey"
  FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "MembershipBillingAttempt" (
  "id",
  "organization",
  "membership",
  "operation",
  "idempotencyKey",
  "requestHash",
  "claimToken",
  "status",
  "leaseUntil",
  "lastError",
  "requestedAt",
  "completedAt"
)
SELECT
  'legacy_' || "id",
  "organization",
  "id",
  "billingOperation",
  "billingOperationKey",
  repeat('0', 64),
  'legacy-migration',
  CASE WHEN "billingOperationStatus" = 'completed' THEN 'completed' ELSE 'failed' END,
  NULL,
  CASE
    WHEN "billingOperationStatus" = 'completed' THEN coalesce("billingOperationError", '')
    ELSE 'Legacy in-flight billing attempt requires a new idempotency key'
  END,
  "updatedAt",
  CASE WHEN "billingOperationStatus" = 'completed' THEN "updatedAt" ELSE NULL END
FROM "Membership"
WHERE coalesce("billingOperationKey", '') <> ''
  AND coalesce("billingOperation", '') <> '';

ALTER TABLE "Membership"
  DROP COLUMN "billingOperation",
  DROP COLUMN "billingOperationError",
  DROP COLUMN "billingOperationKey",
  DROP COLUMN "billingOperationLeaseUntil",
  DROP COLUMN "billingOperationStatus";
