import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/features/storefront/lib/data/user";
import ProfileForm from "@/features/storefront/modules/account/components/profile-form";

export default async function AccountProfilePage() {
  const user = await getUser();
  if (!user) notFound();

  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <p className="sf-eyebrow mb-3">Account details</p>
        <h1 className="sf-display text-[var(--text-display-s)]">Profile</h1>
        <p className="mt-4 sf-lead">
          Keep your contact details up to date so the club can help with your bookings and membership.
        </p>
      </header>

      <section className="max-w-3xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-6 sm:p-8">
        <ProfileForm user={user} />
      </section><div className="sf-quick-grid"><Link className="sf-quick-card" href="/member/profile"><h2>Emergency and member details ↗</h2><p>Your birth date, emergency contact and optional health information.</p></Link><Link className="sf-quick-card" href="/account/participation"><h2>Participation and privacy ↗</h2><p>Manage document acceptance, health consent and privacy requests.</p></Link></div>
    </div>
  );
}
