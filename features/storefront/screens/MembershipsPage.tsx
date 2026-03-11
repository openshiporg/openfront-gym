import { Metadata } from "next"
import MembershipTiers from "@/features/storefront/modules/memberships/components/membership-tiers"
import MembershipFAQ from "@/features/storefront/modules/memberships/components/membership-faq"

export const metadata: Metadata = {
  title: "Membership Plans - Openfront Gym",
  description: "Choose the perfect membership plan for your fitness journey. Flexible options with class credits, personal training, and exclusive benefits.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Membership Plans - Openfront Gym",
    description: "Choose the perfect membership plan for your fitness journey. Flexible options with class credits, personal training, and exclusive benefits.",
  }
}

export async function MembershipsPage() {
  return (
    <div className="container py-8 md:py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          Choose Your Membership
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Flexible plans designed to fit your lifestyle. All memberships include access to our state-of-the-art facilities.
        </p>
      </div>
      <MembershipTiers />
      <MembershipFAQ />
    </div>
  )
}
