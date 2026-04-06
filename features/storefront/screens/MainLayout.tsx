import { Urbanist } from "next/font/google";
import Nav from "@/features/storefront/modules/layout/templates/nav";
import Footer from "@/features/storefront/modules/layout/templates/footer";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

const urbanist = Urbanist({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

interface MainLayoutProps {
  children: React.ReactNode;
  user?: any;
}

export async function MainLayout({ children, user }: MainLayoutProps) {
  const config = await getStorefrontConfig();

  return (
    <div
      className={`${urbanist.variable} dark flex min-h-screen flex-col bg-[#131313] text-[#e5e2e1] font-[family-name:var(--font-space-grotesk)] selection:bg-[#ffb59e] selection:text-[#3a0b00]`}
    >
      <Nav user={user} config={config} />
      <main className="flex-1">{children}</main>
      <Footer config={config} />
    </div>
  );
}
