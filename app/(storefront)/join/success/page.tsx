import type { Metadata } from "next";
import JoinSuccessPage from "@/features/storefront/screens/JoinSuccessPage";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Membership activated — ${getStorefrontBrandName(config)}`,
    description: "Your membership checkout is complete.",
  };
}

export default async function Page(props: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await props.searchParams;
  return <JoinSuccessPage sessionId={session_id} />;
}
