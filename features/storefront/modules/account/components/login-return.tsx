"use client";
import { usePathname, useSearchParams } from "next/navigation";
import LoginPage from "@/features/storefront/screens/LoginPage";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

/** Returns to the exact account view requested (path and query), never to a nested return target. */
export default function LoginReturn({ allowSignup, terms = null }: { allowSignup: boolean; terms?: { policyId: string; version: string } | null }) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams()?.toString() || "");
  for (const key of ["returnTo", "redirectTo", "next", "error", "success"]) params.delete(key);
  const query = params.toString();
  return <LoginPage allowSignup={allowSignup} showHeading redirectTo={safeStorefrontReturnPath(query ? `${pathname}?${query}` : pathname)} terms={terms} />;
}
