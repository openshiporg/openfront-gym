import { redirect } from "next/navigation";

export default function LegacyBillingPage() {
  redirect("/dashboard/platform/billing");
}
