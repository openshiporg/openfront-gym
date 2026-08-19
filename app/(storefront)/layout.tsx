import type { Metadata } from "next";
import StorefrontServer from "@/features/storefront/screens/StorefrontServer";
import { UNCONFIGURED_STOREFRONT } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  if (!config) {
    return {
      title: UNCONFIGURED_STOREFRONT.name,
      description: UNCONFIGURED_STOREFRONT.description,
      robots: { index: false, follow: false },
    };
  }
  const description = config.heroSubheadline || config.description || config.tagline || undefined;
  return {
    title: config.name,
    description,
    openGraph: {
      title: config.name,
      description,
      images: config.heroImageUrl ? [{ url: config.heroImageUrl }] : undefined,
    },
  };
}

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontServer>{children}</StorefrontServer>;
}
