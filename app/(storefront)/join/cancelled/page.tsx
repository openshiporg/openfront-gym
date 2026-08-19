import type { Metadata } from "next";
import { cookies } from "next/headers";
import JoinCancelledPage from "@/features/storefront/screens/JoinCancelledPage";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { CHECKOUT_RETURN_COOKIE } from "@/features/integrations/payment/membership-checkout-contract";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Checkout cancelled — ${getStorefrontBrandName(config)}`,
    description: "Your membership checkout was cancelled.",
  };
}

export default async function Page(props: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await props.searchParams;
  const savedReturnTo = (await cookies()).get(CHECKOUT_RETURN_COOKIE)?.value;
  const returnTo = savedReturnTo ? safeStorefrontReturnPath(savedReturnTo) : null;
  return <JoinCancelledPage tier={tier} returnTo={returnTo} />;
}
