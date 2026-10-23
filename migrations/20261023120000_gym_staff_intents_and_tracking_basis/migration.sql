-- Brings the database up to the models committed in 4031990, whose schema and migration were
-- never generated: StaffIntent, User pending-email fields, ParticipationEvidence.kind,
-- trackingBasis, and onDelete: Restrict on member/user history references.
-- Rows that exist before this migration predate tracking, so they are marked
-- "added_by_migration"; rows created afterwards default to "recorded".

-- DropForeignKey
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_member_fkey";

-- DropForeignKey
ALTER TABLE "CheckIn" DROP CONSTRAINT "CheckIn_member_fkey";

-- DropForeignKey
ALTER TABLE "ClassBooking" DROP CONSTRAINT "ClassBooking_member_fkey";

-- DropForeignKey
ALTER TABLE "GymPayment" DROP CONSTRAINT "GymPayment_member_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_member_fkey";

-- DropForeignKey
ALTER TABLE "MembershipPayment" DROP CONSTRAINT "MembershipPayment_member_fkey";

-- DropForeignKey
ALTER TABLE "OperationsCase" DROP CONSTRAINT "OperationsCase_member_fkey";

-- DropForeignKey
ALTER TABLE "ParticipationEvidence" DROP CONSTRAINT "ParticipationEvidence_member_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSession" DROP CONSTRAINT "PaymentSession_user_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_member_fkey";

-- DropForeignKey
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_member_fkey";

-- DropForeignKey
ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_member_fkey";

-- AlterTable
ALTER TABLE "GymRefundAttempt" ADD COLUMN     "trackingBasis" TEXT NOT NULL DEFAULT 'added_by_migration';
ALTER TABLE "GymRefundAttempt" ALTER COLUMN "trackingBasis" SET DEFAULT 'recorded';

-- AlterTable
ALTER TABLE "MembershipBillingAttempt" ADD COLUMN     "trackingBasis" TEXT NOT NULL DEFAULT 'added_by_migration';
ALTER TABLE "MembershipBillingAttempt" ALTER COLUMN "trackingBasis" SET DEFAULT 'recorded';

-- AlterTable
ALTER TABLE "OnboardingRun" ADD COLUMN     "trackingBasis" TEXT NOT NULL DEFAULT 'added_by_migration';
ALTER TABLE "OnboardingRun" ALTER COLUMN "trackingBasis" SET DEFAULT 'recorded';

-- AlterTable
ALTER TABLE "ParticipationEvidence" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'acceptance';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pendingEmailRequestedAt" TIMESTAMP(3),
ADD COLUMN     "pendingEmailTokenHash" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "StaffIntent" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "actor" TEXT,
    "workspace" TEXT NOT NULL DEFAULT '',
    "operation" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "form" JSONB DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB DEFAULT '{}',
    "lastError" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffIntent_organization_idx" ON "StaffIntent"("organization");

-- CreateIndex
CREATE INDEX "StaffIntent_actor_idx" ON "StaffIntent"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "StaffIntent_organization_requestKey_key" ON "StaffIntent"("organization", "requestKey");

-- AddForeignKey
ALTER TABLE "StaffIntent" ADD CONSTRAINT "StaffIntent_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffIntent" ADD CONSTRAINT "StaffIntent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_member_fkey" FOREIGN KEY ("member") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_member_fkey" FOREIGN KEY ("member") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymPayment" ADD CONSTRAINT "GymPayment_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

