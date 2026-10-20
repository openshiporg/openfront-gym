import LoginReturn from "@/features/storefront/modules/account/components/login-return";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export default async function Default() {
  const terms = (await getStorefrontConfig())?.participationTerms;
  return <LoginReturn allowSignup={process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true"} terms={terms?.acceptanceRequired ? { policyId: terms.policyId, version: terms.version } : null} />;
}
