-- AlterTable
ALTER TABLE "GymSettings" ADD COLUMN "lateCancelHours" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN "lateCancelled" BOOLEAN NOT NULL DEFAULT false;
