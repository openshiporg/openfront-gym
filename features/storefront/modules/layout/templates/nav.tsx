import Link from "next/link";
import AuthNav from "../components/auth-nav";
import NavClient from "../components/NavClient";

export default function Nav({ user, config }: { user?: any; config?: { name?: string | null } | null }) {
  const brandName = config?.name || 'Openfront Gym';
  const words = brandName.trim().split(/\s+/);
  const first = words[0];
  const rest = words.slice(1).join(' ');

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#131313]/96 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Brand wordmark — pure type, no icon */}
        <Link href="/" className="flex shrink-0 items-center transition-opacity hover:opacity-75">
          <span className="font-[family-name:var(--font-space-grotesk)] text-[1.25rem] font-black uppercase tracking-[-0.08em] text-white">
            {first}
          </span>
          {rest && (
            <span className="ml-1.5 font-[family-name:var(--font-space-grotesk)] text-[1.25rem] font-light uppercase tracking-[-0.04em] text-[#818cf8]">
              {rest}
            </span>
          )}
        </Link>

        {/* Center nav + mobile hamburger */}
        <NavClient />

        {/* Right: auth */}
        <AuthNav user={user} />
      </div>
    </header>
  );
}
