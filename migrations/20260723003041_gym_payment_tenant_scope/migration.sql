/*
  Scope provider codes and payment-session idempotency to an organization;
  existing provider/session rows retain their values while global indexes are
  replaced by organization-qualified uniqueness.
*/
-- DropIndex
DROP INDEX "PaymentProvider_code_key";

-- DropIndex
DROP INDEX "PaymentSession_idempotencyKey_key";

-- CreateIndex
CREATE INDEX "PaymentProvider_code_idx" ON "PaymentProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_organization_code_key" ON "PaymentProvider"("organization", "code");

-- CreateIndex
CREATE INDEX "PaymentSession_idempotencyKey_idx" ON "PaymentSession"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_organization_idempotency_key" ON "PaymentSession"("organization", "idempotencyKey");
