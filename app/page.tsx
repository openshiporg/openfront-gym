import StorefrontServer from "@/features/storefront/screens/StorefrontServer";
import { HomePage } from "@/features/storefront/screens/HomePage";

export { generateMetadata } from "@/features/storefront/screens/HomePage";

export default async function Page() {
  return (
    <StorefrontServer>
      <HomePage />
    </StorefrontServer>
  );
}
