import { redirect } from "next/navigation";

export default async function Page(props: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await props.searchParams;
  redirect(tier ? `/join?tier=${tier}` : "/join");
}
