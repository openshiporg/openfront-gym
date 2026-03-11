import { MembershipSignupPage } from "@/features/storefront/screens/MembershipSignupPage"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign Up - Openfront Gym",
  description: "Join Openfront Gym and start your fitness journey today.",
}

export default async function SignupPage(props: {
  searchParams: Promise<{ tier?: string }>
}) {
  const searchParams = await props.searchParams
  return <MembershipSignupPage tier={searchParams.tier} />
}
