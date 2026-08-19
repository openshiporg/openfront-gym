import LoginPage from "@/features/storefront/screens/LoginPage";
import type { Metadata } from "next";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return { title: `Sign in — ${getStorefrontBrandName(config)}` };
}

export default async function Page(props: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await props.searchParams;
  return (
    <LoginPage
      redirectTo={safeStorefrontReturnPath(returnTo)}
      allowSignup={process.env.PUBLIC_SIGNUPS_ALLOWED === "true"}
    />
  );
}
