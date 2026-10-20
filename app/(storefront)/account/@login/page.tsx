import LoginPage from "@/features/storefront/screens/LoginPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export function generateMetadata() {
  return accountMetadata("Account");
}

export default async function Page(props: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ returnTo }, config] = await Promise.all([props.searchParams, getStorefrontConfig()]);
  const terms = config?.participationTerms;
  return (
    <LoginPage
      redirectTo={safeStorefrontReturnPath(returnTo)}
      allowSignup={process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true"}
      showHeading
      terms={terms?.acceptanceRequired ? { policyId: terms.policyId, version: terms.version } : null}
    />
  );
}
