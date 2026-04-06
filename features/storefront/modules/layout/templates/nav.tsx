import Link from "next/link";
import { LogoIcon } from "@/features/dashboard/components/Logo";
import AuthNav from "../components/auth-nav";

const NAV_LINKS = [
  { label: "Classes", href: "/classes" },
  { label: "Schedule", href: "/schedule" },
  { label: "Memberships", href: "/memberships" },
  { label: "Instructors", href: "/instructors" },
];

export default function Nav({ user, config }: { user?: any; config?: { name?: string | null } | null }) {
  const brandName = config?.name || 'Openfront Gym';

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#131313]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[88px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <LogoIcon className="h-7 w-7 text-[#ffb59e]" />
          <span className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.08em] text-white">
            {brandName}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-[family-name:var(--font-space-grotesk)] text-sm font-bold uppercase tracking-[-0.02em] text-[#e5e2e1] transition-colors hover:text-[#ffb59e]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <AuthNav user={user} />
      </div>
    </header>
  );
}
