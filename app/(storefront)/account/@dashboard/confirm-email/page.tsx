import AccountConfirmEmailPage from "@/features/storefront/screens/AccountConfirmEmailPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Confirm email");
}

export default AccountConfirmEmailPage;
