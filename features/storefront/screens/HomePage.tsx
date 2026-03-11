import { Metadata } from "next"
import Hero from "@/features/storefront/modules/home/components/hero"
import FeaturedClasses from "@/features/storefront/modules/home/components/featured-classes"
import TodaysSchedule from "@/features/storefront/modules/home/components/todays-schedule"
import InstructorSpotlight from "@/features/storefront/modules/home/components/instructor-spotlight"
import Testimonials from "@/features/storefront/modules/home/components/testimonials"
import MembershipCTA from "@/features/storefront/modules/home/components/membership-cta"

export const metadata: Metadata = {
  title: "Openfront Gym - Transform Your Body, Elevate Your Mind",
  description: "Join our community of fitness enthusiasts. Book classes, track your progress, and achieve your fitness goals.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Openfront Gym - Transform Your Body, Elevate Your Mind",
    description: "Join our community of fitness enthusiasts. Book classes, track your progress, and achieve your fitness goals.",
  }
}

export async function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedClasses />
      <TodaysSchedule />
      <InstructorSpotlight />
      <Testimonials />
      <MembershipCTA />
    </>
  )
}
