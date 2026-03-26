import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getUser } from "@/features/storefront/lib/data/user";
import AccountLayout from "@/features/storefront/modules/account/templates/account-layout";

export const metadata: Metadata = {
  title: "My Account – Openfront Gym",
};

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
