-- AlterTable
ALTER TABLE "Role"
ADD COLUMN "canManageSettings" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GymSettings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "hours" JSONB DEFAULT '{"monday":"5:00 AM - 11:00 PM","tuesday":"5:00 AM - 11:00 PM","wednesday":"5:00 AM - 11:00 PM","thursday":"5:00 AM - 11:00 PM","friday":"5:00 AM - 10:00 PM","saturday":"6:00 AM - 8:00 PM","sunday":"7:00 AM - 7:00 PM"}',
    "heroEyebrow" TEXT NOT NULL DEFAULT 'Performance without compromise',
    "heroHeadline" TEXT NOT NULL DEFAULT 'Train with structure. Recover with intent.',
    "heroSubheadline" TEXT NOT NULL DEFAULT 'A modern gym storefront with memberships, classes, coaching, and facility access configured from one operational system.',
    "heroPrimaryCtaLabel" TEXT NOT NULL DEFAULT 'Start membership',
    "heroPrimaryCtaHref" TEXT NOT NULL DEFAULT '/join',
    "heroSecondaryCtaLabel" TEXT NOT NULL DEFAULT 'View schedule',
    "heroSecondaryCtaHref" TEXT NOT NULL DEFAULT '/schedule',
    "promoBanner" TEXT NOT NULL DEFAULT 'Memberships, schedules, and coaching all managed from one system.',
    "footerTagline" TEXT NOT NULL DEFAULT 'Structured programming, confident operations, and a better member experience.',
    "copyrightName" TEXT NOT NULL DEFAULT 'Openfront Gym',
    "facilityHeadline" TEXT NOT NULL DEFAULT 'Facility systems',
    "facilityDescription" TEXT NOT NULL DEFAULT 'Training, coaching, recovery, and member access all live in one coordinated environment.',
    "facilityHighlights" JSONB DEFAULT '[]',
    "heroStats" JSONB DEFAULT '[]',
    "contactTopics" JSONB DEFAULT '[]',
    "rating" DECIMAL(2,1) DEFAULT 4.8,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymSettings_pkey" PRIMARY KEY ("id")
);
