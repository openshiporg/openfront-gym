import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FileCheck2, HeartPulse } from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import ProfileForm from "@/features/storefront/modules/account/components/profile-form";
import { Banner } from "@/features/storefront/modules/common/ui";

export default async function AccountProfilePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  if (!user) notFound();
  const emailChanged = Boolean((searchParams ? await searchParams : {}).emailChanged);

  return (
    <>
      <h1 className="sf-h2">Profile</h1>
      {emailChanged ? <Banner tone="ok">Your sign-in email is now {user.email}.</Banner> : null}

      <section className="sf-card" style={{ maxWidth: 760 }} aria-label="Account details">
        <ProfileForm user={user} />
      </section>

      <nav className="sf-tiles" style={{ maxWidth: 760 }} aria-label="More member details">
        <Link className="sf-tile" href="/member/profile"><HeartPulse aria-hidden="true" /><strong>Emergency contact and health<ArrowUpRight aria-hidden="true" /></strong></Link>
        <Link className="sf-tile" href="/account/participation"><FileCheck2 aria-hidden="true" /><strong>Participation and privacy<ArrowUpRight aria-hidden="true" /></strong></Link>
      </nav>
    </>
  );
}
