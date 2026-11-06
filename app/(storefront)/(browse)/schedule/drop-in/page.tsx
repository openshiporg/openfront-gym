import type { Metadata } from "next";
import DropInSuccessPage from "@/features/storefront/screens/DropInSuccessPage";

export const metadata: Metadata = {
  title: "Drop-in confirmation",
  robots: { index: false, follow: false },
};

export default async function Page(props: { searchParams: Promise<{ session_id?: string; class?: string }> }) {
  const { session_id } = await props.searchParams;
  return <DropInSuccessPage sessionId={session_id} />;
}
