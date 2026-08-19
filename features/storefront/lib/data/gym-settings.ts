import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";

export type GymSettingsData = {
  id: string;
  name: string;
  tagline?: string | null;
  logoIcon?: string | null;
  brandHue: number;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  currencyCode?: string | null;
  locale?: string | null;
  timezone?: string | null;
  countryCode?: string | null;
  hours?: Record<string, string> | null;
  heroEyebrow?: string | null;
  heroHeadline?: string | null;
  heroSubheadline?: string | null;
  heroImageUrl?: string | null;
  heroPrimaryCtaLabel?: string | null;
  heroPrimaryCtaHref?: string | null;
  heroSecondaryCtaLabel?: string | null;
  heroSecondaryCtaHref?: string | null;
  promoBanner?: string | null;
  footerTagline?: string | null;
  copyrightName?: string | null;
  facilityHeadline?: string | null;
  facilityDescription?: string | null;
  facilityHighlights?: any[] | null;
  heroStats?: any[] | null;
  contactTopics?: any[] | null;
};

export async function getGymSettings(): Promise<GymSettingsData | null> {
  const result = await gymClient.request<{ publicGymSettings: (Omit<GymSettingsData, "heroImageUrl"> & { heroImagePath?: string | null }) | null }>(gql`
    query StorefrontGymSettings {
      publicGymSettings {
        id name tagline logoIcon brandHue description address phone email currencyCode locale timezone countryCode hours
        heroEyebrow heroHeadline heroSubheadline heroImagePath
        heroPrimaryCtaLabel heroPrimaryCtaHref heroSecondaryCtaLabel heroSecondaryCtaHref
        promoBanner footerTagline copyrightName facilityHeadline facilityDescription
        facilityHighlights heroStats contactTopics
      }
    }
  `);
  const settings = result.publicGymSettings;
  return settings ? { ...settings, heroImageUrl: settings.heroImagePath ?? null } : null;
}

export async function getPrimaryLocation() {
  const settings = await getGymSettings();
  if (!settings) return null;
  return { id: settings.id, name: settings.name, address: settings.address, phone: settings.phone };
}

export async function getStorefrontConfig() {
  const settings = await getGymSettings();
  if (!settings) return null;
  return {
    ...settings,
    address: settings.address || "",
    phone: settings.phone || "",
    locationName: settings.name,
  };
}
