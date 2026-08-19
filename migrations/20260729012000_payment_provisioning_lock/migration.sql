-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "attempts" INTEGER DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentSession" ADD COLUMN     "provisioningLockedUntil" TIMESTAMP(3);
