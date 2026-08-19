import JoinPage from "@/features/storefront/screens/JoinPage";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Join — ${getStorefrontBrandName(config)}`,
    description: config?.description || "Create your account and choose a membership plan.",
  };
}

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; checkoutError?: string; returnTo?: string }>;
}) {
  const { tier, checkoutError, returnTo } = await props.searchParams;
  return <JoinPage tier={tier} checkoutError={checkoutError} returnTo={returnTo} />;
}
