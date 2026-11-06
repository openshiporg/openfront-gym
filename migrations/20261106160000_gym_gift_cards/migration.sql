-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "initialValue" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "purchaserName" TEXT NOT NULL DEFAULT '',
    "purchaserEmail" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "paymentSession" TEXT,
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "ledger" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");
CREATE INDEX "GiftCard_organization_idx" ON "GiftCard"("organization");
CREATE INDEX "GiftCard_paymentSession_idx" ON "GiftCard"("paymentSession");

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
