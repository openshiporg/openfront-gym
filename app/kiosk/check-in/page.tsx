import type { Metadata } from "next"
import KioskCheckInPage from "@/features/kiosk/screens/KioskCheckInPage"
import { getStorefrontBrandName } from "@/features/storefront/lib/brand"
import { brandPaletteCss } from "@/features/storefront/lib/brand-palette"
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings"
import { resolveStorefrontBrand } from "@/features/keystone/lib/storefront-branding"

// Reads live club settings on every request; never prerendered at build.
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig()
  return { title: `Kiosk check-in · ${getStorefrontBrandName(config)}`, robots: { index: false, follow: false } }
}

export default async function Page() {
  const config = await getStorefrontConfig()
  return (
    <div className="sf-root">
      <style>{brandPaletteCss(resolveStorefrontBrand(config).themeHue)}</style>
      <KioskCheckInPage brandName={getStorefrontBrandName(config)} />
    </div>
  )
}
