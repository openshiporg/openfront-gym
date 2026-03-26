import { notFound } from "next/navigation";
import { getUser } from "@/features/storefront/lib/data/user";
import ProfileForm from "@/features/storefront/modules/account/components/profile-form";

export default async function AccountProfilePage() {
  const user = await getUser();
  if (!user) notFound();

  return (
    <div className="space-y-10 text-[#e5e2e1]">
      <header>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
          Profile
        </h1>
        <p className="mt-3 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">Update your identity, contact details, and account credentials.</p>
      </header>
      <div className="max-w-xl bg-[#1c1b1b] p-8">
        <ProfileForm user={user} />
      </div>
    </div>
  );
}
