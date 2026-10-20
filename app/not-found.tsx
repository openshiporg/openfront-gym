import type { Metadata } from "next";
import { connection } from "next/server";
import StorefrontServer from "@/features/storefront/screens/StorefrontServer";
import { NotFoundContent } from "@/features/storefront/screens/NotFoundContent";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  // Unmatched URLs render per request so the published brand is read from the live settings.
  await connection();
  let brand: string | null = null;
  try {
    brand = getStorefrontBrandName(await getStorefrontConfig());
  } catch {
    brand = null;
  }
  return { title: brand ? `Page not found · ${brand}` : "Page not found", robots: { index: false, follow: false } };
}

/** Unmatched URLs get the storefront shell and the branded 404, not Next's bare page. */
export default async function NotFound() {
  await connection();
  return (
    <StorefrontServer>
      <NotFoundContent />
    </StorefrontServer>
  );
}
