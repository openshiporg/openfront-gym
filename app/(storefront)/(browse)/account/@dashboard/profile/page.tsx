import AccountProfilePage from "@/features/storefront/screens/AccountProfilePage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Profile");
}

export default AccountProfilePage;
