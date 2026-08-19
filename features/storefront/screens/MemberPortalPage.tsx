import { Metadata } from "next"
import { redirect } from "next/navigation"
import { getStorefrontBrandName } from "@/features/storefront/lib/brand"
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings"

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig()
  return {
    title: `Member portal — ${getStorefrontBrandName(config)}`,
    description: "View your bookings, membership status, and workout progress",
  }
}

export async function MemberPortalPage() {
  redirect("/account")
}

export default MemberPortalPage
