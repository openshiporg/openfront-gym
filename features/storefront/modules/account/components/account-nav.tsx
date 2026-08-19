"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Calendar, CreditCard, LayoutDashboard, LogOut, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/features/storefront/lib/data/user";

const BASE_NAV = [
  { href: "/account", label: "Overview", icon: User, exact: true },
  { href: "/account/bookings", label: "Bookings", icon: Calendar },
  { href: "/account/membership", label: "Membership", icon: CreditCard },
  { href: "/account/profile", label: "Profile", icon: User },
];

export default function AccountNav({ user }: { user: any }) {
  const pathname = usePathname();
  const items = [
    ...BASE_NAV,
    ...(user?.role?.isInstructor ? [{ href: "/account/instructor", label: "Instructor", icon: GraduationCap }] : []),
  ];

  return (
    <aside className="space-y-5 md:sticky md:top-28 md:self-start">
      <div className="border-l-2 border-[var(--color-accent)] pl-4">
        <p className="text-lg font-semibold">Member account</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{user?.email}</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-y border-[var(--color-rule)] py-2 md:block md:space-y-1 md:overflow-visible md:border-y-0 md:py-0">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href) && item.href !== "/account";
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-ink-muted)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {user?.role?.canAccessDashboard ? (
          <Link
            href="/dashboard"
            className="flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap px-3 py-3 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
          >
            <LayoutDashboard className="h-4 w-4" />
            Admin dashboard
          </Link>
        ) : null}

        <form action={signOut}>
          <button
            type="submit"
            className="flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap px-3 py-3 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-soft)] md:w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}
