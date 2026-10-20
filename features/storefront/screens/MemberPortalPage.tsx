import { Metadata } from "next"
import { redirect } from "next/navigation"

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Account" }
}

export async function MemberPortalPage() {
  redirect("/account")
}

export default MemberPortalPage
