import AccountOverviewPage from "@/features/storefront/screens/AccountOverviewPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Account");
}

export default AccountOverviewPage;
