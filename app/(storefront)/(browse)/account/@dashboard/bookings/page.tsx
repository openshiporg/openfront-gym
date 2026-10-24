import AccountBookingsPage from "@/features/storefront/screens/AccountBookingsPage";
import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export function generateMetadata() {
  return accountMetadata("Bookings");
}

export default AccountBookingsPage;
