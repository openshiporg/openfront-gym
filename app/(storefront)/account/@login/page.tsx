import LoginPage from "@/features/storefront/screens/LoginPage";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In – Openfront Gym" };

export default function Page() {
  return <LoginPage redirectTo="/account" />;
}
