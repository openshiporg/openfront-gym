import "./storefront.css";
import StorefrontServer from "@/features/storefront/screens/StorefrontServer";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontServer>{children}</StorefrontServer>;
}
