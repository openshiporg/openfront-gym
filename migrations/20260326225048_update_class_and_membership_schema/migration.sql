/*
  Warnings:

  - The primary key for the `GymSettings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `GymSettings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "GymSettings" DROP CONSTRAINT "GymSettings_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" INTEGER NOT NULL,
ALTER COLUMN "reviewCount" DROP NOT NULL,
ADD CONSTRAINT "GymSettings_pkey" PRIMARY KEY ("id");
