import type { ReactNode } from "react";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import AccountLayout from "@/features/storefront/modules/account/templates/account-layout";

export async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: ReactNode;
  login?: ReactNode;
}) {
  const [user, config] = await Promise.all([getUser(), getStorefrontConfig()]);

  return (
    <AccountLayout user={user} photo={config?.heroImageUrl ?? null}>
      {user ? dashboard : login}
    </AccountLayout>
  );
}
