import JoinPage from "@/features/storefront/screens/JoinPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join",
  description: "Review a membership plan, sign in and continue to payment.",
};

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; cycle?: string; checkoutError?: string; returnTo?: string }>;
}) {
  const { tier, cycle, checkoutError, returnTo } = await props.searchParams;
  return <JoinPage tier={tier} cycle={cycle} checkoutError={checkoutError} returnTo={returnTo} />;
}
