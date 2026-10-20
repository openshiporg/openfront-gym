import type { Metadata } from "next"
import { redirect } from "next/navigation"
import CheckInCodePage from "@/features/member/screens/CheckInCodePage"
import { getUser } from "@/features/storefront/lib/data/user"
import { getStorefrontBrandName } from "@/features/storefront/lib/brand"
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings"
import { MainLayout } from "@/features/storefront/screens/MainLayout"

// Reads live club settings and the session on every request; never prerendered at build.
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig()
  return { title: `Check-in code · ${getStorefrontBrandName(config)}`, robots: { index: false, follow: false } }
}

export default async function Page() {
  const user = await getUser()
  if (!user) redirect("/account?returnTo=%2Fmember%2Fcheck-in-code")
  return <MainLayout user={user}><CheckInCodePage memberName={user.name} /></MainLayout>
}
