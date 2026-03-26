import type { Metadata } from "next";
import JoinCancelledPage from "@/features/storefront/screens/JoinCancelledPage";

export const metadata: Metadata = {
  title: "Checkout Cancelled – Openfront Gym",
  description: "Your membership checkout was cancelled.",
};

export default async function Page(props: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await props.searchParams;
  return <JoinCancelledPage tier={tier} />;
}
