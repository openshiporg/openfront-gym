import type { Metadata } from "next";
import { GiftCardOrderPage } from "@/features/storefront/screens/GiftCardOrderPage";

export const metadata: Metadata = { title: "Gift card", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams: Promise<{ ref?: string; token?: string; result?: string }> }) {
  return <GiftCardOrderPage params={await props.searchParams} />;
}
