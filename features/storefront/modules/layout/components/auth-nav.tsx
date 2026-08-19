"use client";

import Link from "next/link";
import { Calendar, ChevronDown, GraduationCap, LayoutDashboard, LogOut, User } from "lucide-react";
import { signOut } from "@/features/storefront/lib/data/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AuthNavProps = {
  user?: {
    id: string;
    name: string;
    email: string;
    role?: { isInstructor?: boolean; canAccessDashboard?: boolean } | null;
  } | null;
  joinCta?: { label: string; href: string } | null;
};

export default function AuthNav({ user, joinCta }: AuthNavProps) {
  if (!user) {
    return (
      <div className="sf-auth-nav">
        <Link
          href="/account"
          className="sf-nav-link hidden sm:inline-flex"
        >
          Sign in
        </Link>
        {joinCta ? (
          <Link href={joinCta.href} className="sf-header-cta">
            {joinCta.label}
          </Link>
        ) : null}
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sf-auth-nav">
      <Link href="/schedule" className="sf-btn-secondary hidden px-4 lg:inline-flex">
        Book class
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 transition hover:text-[var(--sf-accent)]">
            <span className="flex h-9 w-9 items-center justify-center border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] text-xs font-semibold">
              {initials}
            </span>
            <span className="hidden text-sm font-medium md:block">{user.name.split(" ")[0]}</span>
            <ChevronDown className="h-4 w-4 text-[var(--sf-ink-muted)]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 border-[var(--sf-rule)] bg-[var(--sf-paper)]">
          <DropdownMenuLabel className="font-normal">
            <p className="font-semibold">{user.name}</p>
            <p className="mt-1 text-xs text-[var(--sf-ink-muted)]">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/account">
              <User className="mr-2 h-4 w-4" /> My account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/bookings">
              <Calendar className="mr-2 h-4 w-4" /> My bookings
            </Link>
          </DropdownMenuItem>
          {user.role?.isInstructor ? (
            <DropdownMenuItem asChild>
              <Link href="/account/instructor">
                <GraduationCap className="mr-2 h-4 w-4" /> Instructor console
              </Link>
            </DropdownMenuItem>
          ) : null}
          {user.role?.canAccessDashboard ? (
            <DropdownMenuItem asChild>
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" /> Admin dashboard
              </Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <form action={signOut} className="w-full">
              <button type="submit" className="flex w-full items-center text-sm text-[var(--sf-accent)]">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
