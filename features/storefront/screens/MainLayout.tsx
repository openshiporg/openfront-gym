import Nav from "@/features/storefront/modules/layout/templates/nav";
import Footer from "@/features/storefront/modules/layout/templates/footer";

interface MainLayoutProps {
  children: React.ReactNode;
  user?: any;
}

export function MainLayout({ children, user }: MainLayoutProps) {
  return (
    <div className="dark flex min-h-screen flex-col bg-[#131313] text-[#e5e2e1] font-[family-name:var(--font-space-grotesk)] selection:bg-[#ffb59e] selection:text-[#3a0b00]">
      <Nav user={user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
