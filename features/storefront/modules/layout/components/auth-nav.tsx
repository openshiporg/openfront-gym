"use client";

import { useRef } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, ChevronDown, GraduationCap, LayoutDashboard, LogOut, QrCode, UserRound } from "lucide-react";
import { signOut } from "@/features/storefront/lib/data/user";
import { initials, firstName } from "@/features/storefront/lib/presentation";

type AuthNavProps = {
  user?: {
    id: string;
    name: string;
    email: string;
    role?: { isInstructor?: boolean; canAccessDashboard?: boolean } | null;
  } | null;
  joinCta?: { label: string; href: string } | null;
};

/** Desktop header account controls (from 1080px). */
export default function AuthNav({ user, joinCta }: AuthNavProps) {
  const signOutForm = useRef<HTMLFormElement>(null);

  if (!user) {
    return (
      <>
        <Link href="/account" className="sf-btn sf-desktop-only" data-variant="ghost" data-size="sm">Sign in</Link>
        {joinCta ? <Link href={joinCta.href} className="sf-btn sf-desktop-only" data-size="sm">{joinCta.label}</Link> : null}
      </>
    );
  }

  return (
    <>
      <Link href="/schedule" className="sf-btn sf-desktop-only" data-size="sm">Book a class</Link>
      <form ref={signOutForm} action={signOut} hidden />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="sf-avatar-btn sf-desktop-only" aria-label={`Account menu for ${user.name}`}>
            <span className="sf-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span>{firstName(user.name, "Account")}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={10} className="sf-portal sf-menu">
            <div className="sf-menu-head">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <DropdownMenu.Item asChild className="sf-menu-item"><Link href="/account"><UserRound aria-hidden="true" />Account</Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild className="sf-menu-item"><Link href="/account/bookings"><CalendarDays aria-hidden="true" />Bookings</Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild className="sf-menu-item"><Link href="/member/check-in-code"><QrCode aria-hidden="true" />Check-in code</Link></DropdownMenu.Item>
            {user.role?.isInstructor ? (
              <DropdownMenu.Item asChild className="sf-menu-item"><Link href="/account/instructor"><GraduationCap aria-hidden="true" />Coach workspace</Link></DropdownMenu.Item>
            ) : null}
            {user.role?.canAccessDashboard ? (
              <DropdownMenu.Item asChild className="sf-menu-item"><Link href="/dashboard"><LayoutDashboard aria-hidden="true" />Dashboard</Link></DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Separator className="sf-menu-sep" />
            <DropdownMenu.Item className="sf-menu-item" onSelect={() => signOutForm.current?.requestSubmit()}>
              <LogOut aria-hidden="true" />Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
