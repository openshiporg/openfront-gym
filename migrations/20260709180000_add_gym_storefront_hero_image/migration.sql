-- Add the local/public storefront hero image path used by onboarding and GymSettings.
ALTER TABLE "GymSettings" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT NOT NULL DEFAULT '';
