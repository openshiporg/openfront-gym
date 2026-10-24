import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export { ParticipationPage as default } from '@/features/storefront/screens/ParticipationPage';

export function generateMetadata() {
  return accountMetadata("Participation and privacy");
}
