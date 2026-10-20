-- Saved logo color: a CSS hue rotation in degrees, kept separate from brandHue.
-- Additive; existing rows read as '0' (no rotation), so current logos render unchanged.
ALTER TABLE "GymSettings" ADD COLUMN "logoColor" TEXT NOT NULL DEFAULT '0';
