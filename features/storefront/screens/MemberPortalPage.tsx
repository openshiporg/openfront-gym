import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Member Portal - Openfront Gym",
  description: "View your bookings, membership status, and workout progress",
}

export async function generateMetadata(): Promise<Metadata> {
  return metadata
}

export async function MemberPortalPage() {
  redirect("/account")
}

export default MemberPortalPage
