import { type Metadata } from "next"
import Hero from "@/features/storefront/modules/home/components/hero"
import FeaturedClasses from "@/features/storefront/modules/home/components/featured-classes"
import TodaysSchedule from "@/features/storefront/modules/home/components/todays-schedule"
import InstructorSpotlight from "@/features/storefront/modules/home/components/instructor-spotlight"
import Testimonials from "@/features/storefront/modules/home/components/testimonials"
import MembershipCTA from "@/features/storefront/modules/home/components/membership-cta"
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings"

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig()
  return {
    title: config?.name ? `${config.name} — ${config.tagline || config.heroEyebrow || "Gym"}` : "Openfront Gym",
    description:
      config?.heroSubheadline ||
      config?.description ||
      "Join a community-first gym with expert-coached group fitness classes, flexible memberships, and a schedule that works around you.",
  }
}

export async function HomePage() {
  return (
    <div className="min-h-screen">
      <Hero />
      <FeaturedClasses />
      <TodaysSchedule />
      <InstructorSpotlight />
      <Testimonials />
      <MembershipCTA />
    </div>
  )
}
