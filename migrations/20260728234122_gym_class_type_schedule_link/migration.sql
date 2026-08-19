-- AlterTable
ALTER TABLE "ClassSchedule" ADD COLUMN     "classType" TEXT;

-- CreateIndex
CREATE INDEX "ClassSchedule_classType_idx" ON "ClassSchedule"("classType");

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_classType_fkey" FOREIGN KEY ("classType") REFERENCES "ClassType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill maintained schedules using the existing canonical class names. Unmatched
-- schedules remain nullable for operator review rather than being assigned blindly.
UPDATE "ClassSchedule" AS schedule
SET "classType" = class_type.id
FROM "ClassType" AS class_type
WHERE schedule."classType" IS NULL
  AND LOWER(schedule.name) LIKE '%' || LOWER(class_type.name) || '%';
