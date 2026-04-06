import { keystoneContext } from "@/features/keystone/context";

export type GymSettingsData = {
  id: string;
  name: string;
  tagline?: string | null;
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
  rating?: string | null;
  reviewCount?: number | null;
};

export async function getGymSettings(): Promise<GymSettingsData | null> {
  const context = keystoneContext.sudo();

  const [settings] = (await (context.query as any).GymSettings.findMany({
    take: 1,
    query: `
      id
      name
      tagline
      description
      address
      phone
      email
      currencyCode
      locale
      timezone
      countryCode
      hours
      heroEyebrow
      heroHeadline
      heroSubheadline
      heroPrimaryCtaLabel
      heroPrimaryCtaHref
      heroSecondaryCtaLabel
      heroSecondaryCtaHref
      promoBanner
      footerTagline
      copyrightName
      facilityHeadline
      facilityDescription
      facilityHighlights
      heroStats
      contactTopics
      rating
      reviewCount
    `,
  })) as GymSettingsData[];

  return settings ?? null;
}

export async function getPrimaryLocation() {
  const context = keystoneContext.sudo();
  const [location] = await context.query.Location.findMany({
    where: { isActive: { equals: true } },
    take: 1,
    query: `
      id
      name
      address
      phone
    `,
  });

  return location ?? null;
}

export async function getStorefrontConfig() {
  const [settings, location] = await Promise.all([getGymSettings(), getPrimaryLocation()]);
  if (!settings) return null;

  return {
    ...settings,
    address: settings.address || location?.address || "",
    phone: settings.phone || location?.phone || "",
    locationName: location?.name || settings.name,
  };
}
