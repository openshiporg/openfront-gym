-- Database backstops for invariants every writer already checks under a lock. A future writer
-- (or a manual repair) that forgets a check is refused here instead of corrupting a balance.
-- Fails closed on existing violations; nothing is silently rewritten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "GiftCard" WHERE "balance" < 0 OR "initialValue" < 0 OR "balance" > "initialValue") THEN RAISE EXCEPTION 'Gift card balances outside 0..initial value require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "TrainingPackage" WHERE "creditsRemaining" < 0 OR "totalCredits" < 1 OR "creditsRemaining" > "totalCredits" OR "amount" < 0 OR coalesce("refundAmount", 0) < 0 OR coalesce("refundAmount", 0) > "amount") THEN RAISE EXCEPTION 'Training package credits or refunds out of range require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "RetailItem" WHERE coalesce("stockOnHand", 0) < 0 OR "unitAmount" < 0) THEN RAISE EXCEPTION 'Negative retail stock or price requires manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "GymPayment" WHERE "amount" < 0 OR coalesce("refundAmount", 0) < 0 OR coalesce("refundAmount", 0) > "amount") THEN RAISE EXCEPTION 'Gym payment refunds above the paid amount require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "MembershipPayment" WHERE "amount" < 0 OR coalesce("refundAmount", 0) < 0 OR coalesce("refundAmount", 0) > "amount") THEN RAISE EXCEPTION 'Membership payment refunds above the paid amount require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "MembershipCreditGrant" WHERE NOT (("allowance" = -1 AND "remaining" = -1) OR ("allowance" >= 0 AND "remaining" BETWEEN 0 AND "allowance"))) THEN RAISE EXCEPTION 'Class credit grants out of range require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "TrainerAppointment" WHERE "endTime" <= "startTime") THEN RAISE EXCEPTION 'Appointments ending before they start require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "ClassInstance" WHERE "endsAt" IS NOT NULL AND "endsAt" <= "date") THEN RAISE EXCEPTION 'Class sessions ending before they start require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "MembershipCreditGrant" WHERE "periodEnd" <= "periodStart") THEN RAISE EXCEPTION 'Credit periods ending before they start require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "RetailClose" WHERE "periodEnd" <= "periodStart") THEN RAISE EXCEPTION 'Cash closes ending before they start require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "GymPayment" WHERE "stripePaymentIntentId" IS NOT NULL AND "stripePaymentIntentId" <> '' GROUP BY "organization", "stripePaymentIntentId" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate gym payments for one card payment require manual remediation'; END IF;
END $$;

ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_range" CHECK ("initialValue" >= 0 AND "balance" >= 0 AND "balance" <= "initialValue");
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_credit_range" CHECK ("totalCredits" >= 1 AND "creditsRemaining" >= 0 AND "creditsRemaining" <= "totalCredits");
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_stock_price_nonnegative" CHECK (coalesce("stockOnHand", 0) >= 0 AND "unitAmount" >= 0);
ALTER TABLE "GymPayment" ADD CONSTRAINT "GymPayment_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_remaining_range" CHECK (("allowance" = -1 AND "remaining" = -1) OR ("allowance" >= 0 AND "remaining" BETWEEN 0 AND "allowance"));
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_period_order" CHECK ("periodEnd" > "periodStart");
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_time_order" CHECK ("endTime" > "startTime");
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_time_order" CHECK ("endsAt" IS NULL OR "endsAt" > "date");
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_period_order" CHECK ("periodEnd" > "periodStart");

-- One local payment per card payment: the drop-in and invoice writers look up by payment intent
-- before creating, and this makes a concurrent second create fail instead of double-counting.
CREATE UNIQUE INDEX "GymPayment_organization_paymentIntent_key" ON "GymPayment"("organization", "stripePaymentIntentId")
  WHERE "stripePaymentIntentId" IS NOT NULL AND "stripePaymentIntentId" <> '';
