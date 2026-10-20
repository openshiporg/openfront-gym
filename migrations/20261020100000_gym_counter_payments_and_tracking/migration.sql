-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "serviceSnapshot" JSONB;

-- AlterTable
ALTER TABLE "GymResource" ADD COLUMN     "allocationHistory" JSONB DEFAULT '[]';

-- AlterTable
ALTER TABLE "OnboardingRun" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "manifest" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GymRefundAttempt" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MembershipBillingAttempt" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "AuthRateLimitBucket" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CounterPaymentAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "quote" JSONB DEFAULT '{}',
    "providerId" TEXT NOT NULL DEFAULT '',
    "providerKey" TEXT NOT NULL DEFAULT '',
    "providerCheckoutId" TEXT NOT NULL DEFAULT '',
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "result" JSONB DEFAULT '{}',
    "lastError" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_organization_idx" ON "CounterPaymentAttempt"("organization");

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_location_idx" ON "CounterPaymentAttempt"("location");

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_recordedBy_idx" ON "CounterPaymentAttempt"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CounterPaymentAttempt_organization_requestKey_key" ON "CounterPaymentAttempt"("organization", "requestKey");

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- No backfills. Existing rows keep every lifecycle time they recorded (startedAt, requestedAt,
-- completedAt); their new tracking columns start when tracking was added, and a later migration
-- marks them so (trackingBasis). Legacy allocation arrays stay where they were, in metadata, and
-- are not promoted into the protected allocation history. Nothing infers account provenance.
