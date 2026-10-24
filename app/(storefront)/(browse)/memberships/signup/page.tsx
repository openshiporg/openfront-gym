import { joinPath } from "@/features/storefront/lib/return-path";
import { redirect } from "next/navigation";

export default async function Page(props: {
  searchParams: Promise<{ tier?: string; cycle?: string; returnTo?: string }>;
}) {
  const { tier, cycle, returnTo } = await props.searchParams;
  redirect(joinPath(tier, returnTo, cycle));
}
