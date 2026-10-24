import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export { default } from "@/features/storefront/screens/AccountTrainingPage";

export function generateMetadata() {
  return accountMetadata("Personal training");
}
