import JoinPage from "@/features/storefront/screens/JoinPage";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: config?.name ? `Join — ${config.name}` : "Join",
    description: config?.description || "Create your account and choose a membership plan.",
  };
}

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; checkoutError?: string }>;
}) {
  const { tier, checkoutError } = await props.searchParams;
  return <JoinPage tier={tier} checkoutError={checkoutError} />;
}
