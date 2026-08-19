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
          Keep your sign-in identity and member contact details aligned for bookings, billing, and front-desk support.
        </p>
      </header>

      <section className="max-w-3xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-6 sm:p-8">
        <ProfileForm user={user} />
      </section>
    </div>
  );
}
