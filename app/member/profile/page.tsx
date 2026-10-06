import { redirect } from "next/navigation"
import MemberProfilePage from "@/features/member/screens/MemberProfilePage"
import { getUser } from "@/features/storefront/lib/data/user"
import { MainLayout } from "@/features/storefront/screens/MainLayout"

export default async function Page() {
  const user = await getUser()
  if (!user) redirect("/account?returnTo=%2Fmember%2Fprofile")
  return <MainLayout user={user}><MemberProfilePage /></MainLayout>
}
