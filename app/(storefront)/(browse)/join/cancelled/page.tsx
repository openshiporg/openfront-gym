import type { Metadata } from "next";
import { cookies } from "next/headers";
import JoinCancelledPage from "@/features/storefront/screens/JoinCancelledPage";
import { CHECKOUT_CYCLE_COOKIE, CHECKOUT_RETURN_COOKIE } from "@/features/integrations/payment/membership-checkout-contract";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export const metadata: Metadata = {
  title: "Checkout cancelled",
  robots: { index: false, follow: false },
};

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; cycle?: string }>;
}) {
  const { tier, cycle: requestedCycle } = await props.searchParams;
  const jar = await cookies();
  const savedReturnTo = jar.get(CHECKOUT_RETURN_COOKIE)?.value;
  const returnTo = savedReturnTo ? safeStorefrontReturnPath(savedReturnTo) : null;
  const cycle = (requestedCycle || jar.get(CHECKOUT_CYCLE_COOKIE)?.value) === "annual" ? "annual" : "monthly";
  return <JoinCancelledPage tier={tier} returnTo={returnTo} cycle={cycle} />;
}
