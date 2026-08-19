-- Expand/validate/backfill/contract. This migration fails closed on ambiguous existing data;
-- it never silently deletes or merges tenant records.
ALTER TABLE "CheckIn" ADD COLUMN "openCheckInKey" TEXT;
ALTER TABLE "ClassBooking" ADD COLUMN "activeBookingKey" TEXT;

CREATE TABLE "OnboardingRun" (
  "id" TEXT NOT NULL,
  "organization" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "attempts" INTEGER DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "OnboardingRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnboardingRun_organization_idx" ON "OnboardingRun"("organization");
CREATE UNIQUE INDEX "OnboardingRun_organization_key" ON "OnboardingRun"("organization");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Member" WHERE "user" IS NOT NULL GROUP BY "organization", "user" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant member/user ownership requires manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Instructor" WHERE "user" IS NOT NULL GROUP BY "organization", "user" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant instructor/user ownership requires manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "ClassBooking" WHERE "status" <> 'cancelled' AND "classInstance" IS NOT NULL AND "member" IS NOT NULL GROUP BY "organization", "classInstance", "member" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate active class bookings require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "AttendanceRecord" WHERE "booking" IS NOT NULL GROUP BY "organization", "booking" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate attendance records require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "CheckIn" WHERE "checkOutTime" IS NULL AND "member" IS NOT NULL GROUP BY "organization", "member" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate open check-ins require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Location" GROUP BY "organization", "name" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant location names require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "MembershipTier" GROUP BY "organization", "name" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant membership tier names require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "ClassType" GROUP BY "organization", "name" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant class type names require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Exercise" GROUP BY "organization", "name" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant exercise names require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Role" WHERE "organization" IS NOT NULL GROUP BY "organization", "name" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant role names require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "ClassSchedule" GROUP BY "organization", "name", "dayOfWeek", "startTime", "instructor" HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate tenant class schedules require manual remediation'; END IF;
END $$;

UPDATE "ClassBooking" SET "activeBookingKey" = 'active' WHERE "status" <> 'cancelled' AND "activeBookingKey" IS NULL;
UPDATE "CheckIn" SET "openCheckInKey" = 'open' WHERE "checkOutTime" IS NULL AND "member" IS NOT NULL AND "openCheckInKey" IS NULL;

CREATE UNIQUE INDEX "AttendanceRecord_organization_booking_key" ON "AttendanceRecord"("organization", "booking");
CREATE UNIQUE INDEX "CheckIn_organization_member_openCheckInKey_key" ON "CheckIn"("organization", "member", "openCheckInKey");
CREATE UNIQUE INDEX "ClassBooking_organization_classInstance_member_activeBookin_key" ON "ClassBooking"("organization", "classInstance", "member", "activeBookingKey");
CREATE UNIQUE INDEX "ClassSchedule_organization_name_dayOfWeek_startTime_instruc_key" ON "ClassSchedule"("organization", "name", "dayOfWeek", "startTime", "instructor");
CREATE UNIQUE INDEX "ClassType_organization_name_key" ON "ClassType"("organization", "name");
CREATE UNIQUE INDEX "Exercise_organization_name_key" ON "Exercise"("organization", "name");
CREATE UNIQUE INDEX "Instructor_organization_user_key" ON "Instructor"("organization", "user");
CREATE UNIQUE INDEX "Location_organization_name_key" ON "Location"("organization", "name");
CREATE UNIQUE INDEX "Member_organization_user_key" ON "Member"("organization", "user");
CREATE UNIQUE INDEX "MembershipTier_organization_name_key" ON "MembershipTier"("organization", "name");
CREATE UNIQUE INDEX "Role_organization_name_key" ON "Role"("organization", "name");

ALTER TABLE "OnboardingRun" ADD CONSTRAINT "OnboardingRun_organization_fkey"
  FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
