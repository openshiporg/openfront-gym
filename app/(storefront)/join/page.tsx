import JoinPage from "@/features/storefront/screens/JoinPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join – Openfront Gym",
  description: "Create your account and choose a membership plan.",
};

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; checkoutError?: string }>;
}) {
  const { tier, checkoutError } = await props.searchParams;
  return <JoinPage tier={tier} checkoutError={checkoutError} />;
}
