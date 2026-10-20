"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_NAV = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/bookings", label: "Bookings" },
  { href: "/account/membership", label: "Membership" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/participation", label: "Participation" },
  { href: "/account/training", label: "Training" },
];

export default function AccountNav({ user }: { user: any }) {
  const pathname = usePathname() || "";
  const items = [
    ...BASE_NAV,
    ...(user?.role?.isInstructor ? [{ href: "/account/instructor", label: "Coach workspace" }] : []),
    ...(user?.role?.canAccessDashboard ? [{ href: "/dashboard", label: "Dashboard" }] : []),
  ];

  return (
    <nav aria-label="Account sections" className="sf-seg">
      {items.map((item) => {
        const active = "exact" in item && item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
