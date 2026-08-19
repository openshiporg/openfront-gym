-- Persist bounded storefront identity/theme controls without inventing a logo.
ALTER TABLE "GymSettings"
  ADD COLUMN "logoIcon" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "brandHue" INTEGER NOT NULL DEFAULT 16;

-- New settings rows must not silently recover the former demo marketing copy.
ALTER TABLE "GymSettings"
  ALTER COLUMN "tagline" SET DEFAULT '',
  ALTER COLUMN "hours" SET DEFAULT '{}',
  ALTER COLUMN "heroEyebrow" SET DEFAULT '',
  ALTER COLUMN "heroHeadline" SET DEFAULT '',
  ALTER COLUMN "heroSubheadline" SET DEFAULT '',
  ALTER COLUMN "heroPrimaryCtaLabel" SET DEFAULT '',
  ALTER COLUMN "heroPrimaryCtaHref" SET DEFAULT '',
  ALTER COLUMN "heroSecondaryCtaLabel" SET DEFAULT '',
  ALTER COLUMN "heroSecondaryCtaHref" SET DEFAULT '',
  ALTER COLUMN "promoBanner" SET DEFAULT '',
  ALTER COLUMN "footerTagline" SET DEFAULT '',
  ALTER COLUMN "copyrightName" SET DEFAULT '',
  ALTER COLUMN "facilityHeadline" SET DEFAULT '',
  ALTER COLUMN "facilityDescription" SET DEFAULT '';

ALTER TABLE "GymSettings"
  ADD CONSTRAINT "GymSettings_brandHue_range" CHECK ("brandHue" >= 0 AND "brandHue" <= 359);
