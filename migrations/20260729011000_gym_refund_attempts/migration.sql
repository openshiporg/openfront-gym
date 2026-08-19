-- CreateTable
CREATE TABLE "GymRefundAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "payment" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'processing',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GymRefundAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GymRefundAttempt_organization_idx" ON "GymRefundAttempt"("organization");

-- CreateIndex
CREATE INDEX "GymRefundAttempt_payment_idx" ON "GymRefundAttempt"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "GymRefundAttempt_organization_request_key" ON "GymRefundAttempt"("organization", "requestKey");

-- AddForeignKey
ALTER TABLE "GymRefundAttempt" ADD CONSTRAINT "GymRefundAttempt_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymRefundAttempt" ADD CONSTRAINT "GymRefundAttempt_payment_fkey" FOREIGN KEY ("payment") REFERENCES "GymPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
