import { redirect } from "next/navigation"
import CheckInCodePage from "@/features/member/screens/CheckInCodePage"
import { getUser } from "@/features/storefront/lib/data/user"
import { MainLayout } from "@/features/storefront/screens/MainLayout"

export default async function Page() {
  const user = await getUser()
  if (!user) redirect("/account?returnTo=%2Fmember%2Fcheck-in-code")
  return <MainLayout user={user}><CheckInCodePage /></MainLayout>
}
