"use client";
import { usePathname } from "next/navigation";
import LoginPage from "@/features/storefront/screens/LoginPage";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";
export default function LoginReturn({ allowSignup }: { allowSignup: boolean }) {
  const pathname = usePathname();
  return <LoginPage allowSignup={allowSignup} showHeading redirectTo={safeStorefrontReturnPath(pathname)} />;
}
