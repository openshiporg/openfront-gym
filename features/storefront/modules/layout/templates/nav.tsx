import Link from "next/link"
import { keystoneContext } from "@/features/keystone/context"
import AuthNav from "../components/auth-nav"
import ClassSearch from "../components/class-search"
import { Logo } from "@/features/dashboard/components/Logo"

async function getAuthenticatedUser() {
  const context = keystoneContext.sudo();
  const users = await context.query.User.findMany({
    take: 1,
    query: `
      id
      name
      email
      role { isInstructor }
    `,
  });
  return users.length ? users[0] : null;
}

export default async function Nav() {
  const user = await getAuthenticatedUser();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
          
          <div className="hidden lg:flex items-center gap-8">
            {[
              { label: "Disciplines", href: "/classes" },
              { label: "Schedule", href: "/schedule" },
              { label: "Memberships", href: "/memberships" },
              { label: "Instructors", href: "/instructors" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:block">
            <ClassSearch />
          </div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <AuthNav user={user as any} />
        </div>
      </div>
    </nav>
  )
}
