import type { Metadata } from "next";
import JoinSuccessPage from "@/features/storefront/screens/JoinSuccessPage";

export const metadata: Metadata = {
  title: "Membership Activated – Openfront Gym",
  description: "Your membership checkout is complete.",
};

export default async function Page(props: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await props.searchParams;
  return <JoinSuccessPage sessionId={session_id} />;
}
