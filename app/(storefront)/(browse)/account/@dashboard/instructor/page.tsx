import { InstructorAccountPage } from "@/features/storefront/screens/InstructorAccountPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Coach workspace");
}

export default InstructorAccountPage;
