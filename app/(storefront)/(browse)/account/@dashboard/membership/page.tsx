import AccountMembershipPage from "@/features/storefront/screens/AccountMembershipPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Membership");
}

export default AccountMembershipPage;
