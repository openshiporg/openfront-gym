import { redirect } from "next/navigation";

/** A member opens on the shared item page; the platform path is kept so links to it still work. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/members/${encodeURIComponent(id)}`);
}
