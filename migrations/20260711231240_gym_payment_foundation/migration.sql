/*
  Warnings:

  - You are about to alter the column `amount` on the `MembershipPayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `refundAmount` on the `MembershipPayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - A unique constraint covering the columns `[stripeInvoiceId]` on the table `GymPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeInvoiceId]` on the table `MembershipPayment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "GymPayment" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "paymentSession" TEXT,
ALTER COLUMN "stripePaymentIntentId" DROP NOT NULL,
ALTER COLUMN "stripePaymentIntentId" DROP DEFAULT,
ALTER COLUMN "stripeChargeId" DROP NOT NULL,
ALTER COLUMN "stripeChargeId" DROP DEFAULT,
ALTER COLUMN "stripeInvoiceId" DROP NOT NULL,
ALTER COLUMN "stripeInvoiceId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GymSettings" ALTER COLUMN "copyrightName" SET DEFAULT 'Kinetic Performance Club';

-- AlterTable
ALTER TABLE "MembershipPayment" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ALTER COLUMN "amount" SET DATA TYPE INTEGER USING ROUND("amount" * 100)::INTEGER,
ALTER COLUMN "stripePaymentIntentId" DROP NOT NULL,
ALTER COLUMN "stripePaymentIntentId" DROP DEFAULT,
ALTER COLUMN "stripeChargeId" DROP NOT NULL,
ALTER COLUMN "stripeChargeId" DROP DEFAULT,
ALTER COLUMN "stripeInvoiceId" DROP NOT NULL,
ALTER COLUMN "stripeInvoiceId" DROP DEFAULT,
ALTER COLUMN "refundAmount" SET DATA TYPE INTEGER USING CASE
  WHEN "refundAmount" IS NULL THEN NULL
  ELSE ROUND("refundAmount" * 100)::INTEGER
END;

-- Normalize historical empty provider identifiers before adding nullable unique indexes.
UPDATE "GymPayment"
SET "stripePaymentIntentId" = NULLIF("stripePaymentIntentId", ''),
    "stripeChargeId" = NULLIF("stripeChargeId", ''),
    "stripeInvoiceId" = NULLIF("stripeInvoiceId", '');

UPDATE "MembershipPayment"
SET "stripePaymentIntentId" = NULLIF("stripePaymentIntentId", ''),
    "stripeChargeId" = NULLIF("stripeChargeId", ''),
    "stripeInvoiceId" = NULLIF("stripeInvoiceId", '');

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "membershipTier" TEXT,
    "paymentProvider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "billingCycle" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "providerSessionId" TEXT,
    "providerCustomerId" TEXT NOT NULL DEFAULT '',
    "providerSubscriptionId" TEXT,
    "checkoutUrl" TEXT,
    "data" JSONB DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "paymentProvider" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "data" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_idempotencyKey_key" ON "PaymentSession"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_providerSessionId_key" ON "PaymentSession"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_providerSubscriptionId_key" ON "PaymentSession"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentSession_user_idx" ON "PaymentSession"("user");

-- CreateIndex
CREATE INDEX "PaymentSession_membershipTier_idx" ON "PaymentSession"("membershipTier");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentProvider_idx" ON "PaymentSession"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentProvider_idx" ON "PaymentEvent"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "GymPayment_stripeInvoiceId_key" ON "GymPayment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "GymPayment_paymentProvider_idx" ON "GymPayment"("paymentProvider");

-- CreateIndex
CREATE INDEX "GymPayment_paymentSession_idx" ON "GymPayment"("paymentSession");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPayment_stripeInvoiceId_key" ON "MembershipPayment"("stripeInvoiceId");

-- AddForeignKey
ALTER TABLE "GymPayment" ADD CONSTRAINT "GymPayment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymPayment" ADD CONSTRAINT "GymPayment_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_membershipTier_fkey" FOREIGN KEY ("membershipTier") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
