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
    ...(user?.role?.isInstructor ? [{ href: "/account/instructor", label: "Instructor console", icon: GraduationCap }] : []),
  ];

  return (
    <aside className="space-y-6 md:sticky md:top-28 md:self-start">
      <div className="border-l-4 border-[#818cf8] pl-4">
        <p className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
          Athlete portal
        </p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">{user?.email}</p>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href) && item.href !== "/account";
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] transition-colors",
                active ? "bg-[#1c1b1b] text-[#818cf8]" : "text-[#c4c7c7] hover:bg-[#1c1b1b] hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {user?.role?.canAccessDashboard && (
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-[#c4c7c7] transition-colors hover:bg-[#1c1b1b] hover:text-white">
            <LayoutDashboard className="h-4 w-4" />
            Admin dashboard
          </Link>
        )}

        <form action={signOut}>
          <button type="submit" className="flex w-full items-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-[#ffb4ab] transition-colors hover:bg-[#1c1b1b]">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}
