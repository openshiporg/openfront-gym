/*
  Safe tenant ownership bridge: legacy rows receive the deterministic default
  organization before required tenant foreign keys are enforced. New trainer
  tables are created with required ownership and appointment idempotency uses
  an organization-scoped unique key.
*/
-- CreateEnum
CREATE TYPE "OrganizationStatusType" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "GymResourceTypeType" AS ENUM ('room', 'court', 'lane', 'equipment', 'recovery', 'other');

-- CreateEnum
CREATE TYPE "TrainerAvailabilityTypeType" AS ENUM ('recurring', 'one_time', 'time_off');

-- CreateEnum
CREATE TYPE "TrainerAppointmentStatusType" AS ENUM ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "status" "OrganizationStatusType" NOT NULL DEFAULT 'active',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "isMultiLocation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);


-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "ClassInstance" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "ClassSchedule" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "GymPayment" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "GymSettings" DROP CONSTRAINT "GymSettings_pkey",
ADD COLUMN     "organization" TEXT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "GymSettings_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Instructor" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "MembershipPayment" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "PaymentProvider" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "PaymentSession" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canManageAppointments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageCommunications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageFacilities" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManagePayroll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManagePrograms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageRetail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewReports" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "Waitlist" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "organization" TEXT;

-- AlterTable
ALTER TABLE "WorkoutSet" ADD COLUMN     "organization" TEXT;

-- Backfill all pre-tenant rows into the deterministic default organization.
INSERT INTO "Organization" ("id", "name", "slug", "status", "defaultCurrency", "timezone", "isMultiLocation") VALUES ('gym_default_organization', 'Gym Organization', 'default-gym', 'active', 'USD', 'America/Los_Angeles', true);
UPDATE "User" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Role" SET
  "organization" = 'gym_default_organization',
  "canManageAppointments" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManageAppointments" END,
  "canManageFacilities" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManageFacilities" END,
  "canManagePrograms" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManagePrograms" END,
  "canManageCommunications" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManageCommunications" END,
  "canManageRetail" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManageRetail" END,
  "canManagePayroll" = CASE WHEN "canManageAllRecords" THEN true ELSE "canManagePayroll" END,
  "canViewReports" = CASE WHEN "canManageAllRecords" THEN true ELSE "canViewReports" END
WHERE "organization" IS NULL;
UPDATE "AttendanceRecord" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "CheckIn" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "ClassBooking" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "ClassInstance" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "ClassSchedule" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "ClassType" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Exercise" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "GymPayment" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "GymSettings" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Instructor" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Location" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Member" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Membership" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "MembershipPayment" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "MembershipTier" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "PaymentEvent" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "PaymentMethod" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "PaymentProvider" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "PaymentSession" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Subscription" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "Waitlist" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "WorkoutLog" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;
UPDATE "WorkoutSet" SET "organization" = 'gym_default_organization' WHERE "organization" IS NULL;

-- Enforce tenant ownership after the legacy rows have been assigned.
ALTER TABLE "AttendanceRecord" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "CheckIn" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "ClassBooking" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "ClassInstance" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "ClassSchedule" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "ClassType" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Exercise" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "GymPayment" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "GymSettings" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Instructor" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Member" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "MembershipPayment" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "MembershipTier" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "PaymentEvent" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "PaymentProvider" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "PaymentSession" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "Waitlist" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "WorkoutLog" ALTER COLUMN "organization" SET NOT NULL;
ALTER TABLE "WorkoutSet" ALTER COLUMN "organization" SET NOT NULL;

-- CreateTable
CREATE TABLE "GymResource" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" "GymResourceTypeType" NOT NULL DEFAULT 'room',
    "capacity" INTEGER DEFAULT 1,
    "isExclusive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setupBufferMinutes" INTEGER DEFAULT 0,
    "cleanupBufferMinutes" INTEGER DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAvailability" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" "TrainerAvailabilityTypeType" NOT NULL DEFAULT 'recurring',
    "dayOfWeek" INTEGER,
    "date" TIMESTAMP(3),
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAppointment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "resource" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "TrainerAppointmentStatusType" NOT NULL DEFAULT 'scheduled',
    "serviceName" TEXT NOT NULL DEFAULT '',
    "priceAmount" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "memberNotes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "GymResource_organization_idx" ON "GymResource"("organization");

-- CreateIndex
CREATE INDEX "GymResource_location_idx" ON "GymResource"("location");

-- CreateIndex
CREATE INDEX "TrainerAvailability_organization_idx" ON "TrainerAvailability"("organization");

-- CreateIndex
CREATE INDEX "TrainerAvailability_instructor_idx" ON "TrainerAvailability"("instructor");

-- CreateIndex
CREATE INDEX "TrainerAvailability_location_idx" ON "TrainerAvailability"("location");

-- CreateIndex
CREATE INDEX "TrainerAppointment_organization_idx" ON "TrainerAppointment"("organization");

-- CreateIndex
CREATE INDEX "TrainerAppointment_member_idx" ON "TrainerAppointment"("member");

-- CreateIndex
CREATE INDEX "TrainerAppointment_instructor_idx" ON "TrainerAppointment"("instructor");

-- CreateIndex
CREATE INDEX "TrainerAppointment_location_idx" ON "TrainerAppointment"("location");

-- CreateIndex
CREATE INDEX "TrainerAppointment_resource_idx" ON "TrainerAppointment"("resource");

-- CreateIndex
CREATE INDEX "TrainerAppointment_idempotencyKey_idx" ON "TrainerAppointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TrainerAppointment_payment_idx" ON "TrainerAppointment"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAppointment_organization_idempotency_key" ON "TrainerAppointment"("organization", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organization_idx" ON "AttendanceRecord"("organization");

-- CreateIndex
CREATE INDEX "CheckIn_organization_idx" ON "CheckIn"("organization");

-- CreateIndex
CREATE INDEX "ClassBooking_organization_idx" ON "ClassBooking"("organization");

-- CreateIndex
CREATE INDEX "ClassInstance_organization_idx" ON "ClassInstance"("organization");

-- CreateIndex
CREATE INDEX "ClassSchedule_organization_idx" ON "ClassSchedule"("organization");

-- CreateIndex
CREATE INDEX "ClassType_organization_idx" ON "ClassType"("organization");

-- CreateIndex
CREATE INDEX "Exercise_organization_idx" ON "Exercise"("organization");

-- CreateIndex
CREATE INDEX "GymPayment_organization_idx" ON "GymPayment"("organization");

-- CreateIndex
CREATE INDEX "GymSettings_organization_idx" ON "GymSettings"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "GymSettings_organization_key" ON "GymSettings"("organization");

-- CreateIndex
CREATE INDEX "Instructor_organization_idx" ON "Instructor"("organization");

-- CreateIndex
CREATE INDEX "Location_organization_idx" ON "Location"("organization");

-- CreateIndex
CREATE INDEX "Member_organization_idx" ON "Member"("organization");

-- CreateIndex
CREATE INDEX "Membership_organization_idx" ON "Membership"("organization");

-- CreateIndex
CREATE INDEX "MembershipPayment_organization_idx" ON "MembershipPayment"("organization");

-- CreateIndex
CREATE INDEX "MembershipTier_organization_idx" ON "MembershipTier"("organization");

-- CreateIndex
CREATE INDEX "PaymentEvent_organization_idx" ON "PaymentEvent"("organization");

-- CreateIndex
CREATE INDEX "PaymentMethod_organization_idx" ON "PaymentMethod"("organization");

-- CreateIndex
CREATE INDEX "PaymentProvider_organization_idx" ON "PaymentProvider"("organization");

-- CreateIndex
CREATE INDEX "PaymentSession_organization_idx" ON "PaymentSession"("organization");

-- CreateIndex
CREATE INDEX "Role_organization_idx" ON "Role"("organization");

-- CreateIndex
CREATE INDEX "Subscription_organization_idx" ON "Subscription"("organization");

-- CreateIndex
CREATE INDEX "User_organization_idx" ON "User"("organization");

-- CreateIndex
CREATE INDEX "Waitlist_organization_idx" ON "Waitlist"("organization");

-- CreateIndex
CREATE INDEX "WorkoutLog_organization_idx" ON "WorkoutLog"("organization");

-- CreateIndex
CREATE INDEX "WorkoutSet_organization_idx" ON "WorkoutSet"("organization");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTier" ADD CONSTRAINT "MembershipTier_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymPayment" ADD CONSTRAINT "GymPayment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProvider" ADD CONSTRAINT "PaymentProvider_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSettings" ADD CONSTRAINT "GymSettings_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassType" ADD CONSTRAINT "ClassType_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instructor" ADD CONSTRAINT "Instructor_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymResource" ADD CONSTRAINT "GymResource_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymResource" ADD CONSTRAINT "GymResource_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailability" ADD CONSTRAINT "TrainerAvailability_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailability" ADD CONSTRAINT "TrainerAvailability_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailability" ADD CONSTRAINT "TrainerAvailability_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_resource_fkey" FOREIGN KEY ("resource") REFERENCES "GymResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_payment_fkey" FOREIGN KEY ("payment") REFERENCES "GymPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
