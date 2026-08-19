import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import AccountLayout from "@/features/storefront/modules/account/templates/account-layout";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return { title: `My account — ${getStorefrontBrandName(config)}` };
}

export async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: ReactNode;
  login?: ReactNode;
}) {
  const user = await getUser();

  return (
    <AccountLayout user={user}>
      {user ? dashboard : login}
    </AccountLayout>
  );
}
