-- AlterTable
ALTER TABLE "GymSettings" ADD COLUMN     "participationTerms" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ParticipationPolicy" ADD COLUMN     "documentText" TEXT NOT NULL DEFAULT '';
