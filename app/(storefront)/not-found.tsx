import { NotFoundContent } from "@/features/storefront/screens/NotFoundContent";

export const metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function StorefrontNotFound() {
  return <NotFoundContent />;
}
