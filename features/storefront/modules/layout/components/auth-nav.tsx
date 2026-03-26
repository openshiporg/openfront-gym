"use client";

import Link from "next/link";
import { ChevronDown, User, Calendar, LogOut, LayoutDashboard, GraduationCap } from "lucide-react";
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
};

export default function AuthNav({ user }: AuthNavProps) {
  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/account"
          className="hidden text-sm font-bold uppercase tracking-widest text-[#e5e2e1] transition-colors hover:text-[#ffb59e] sm:inline-flex"
        >
          Sign in
        </Link>
        <Link
          href="/join"
          className="inline-flex items-center bg-[#ffb59e] px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#3a0b00] transition-transform active:scale-95"
        >
          Join now
        </Link>
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/schedule"
        className="hidden border border-[#ffb59e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#ffb59e] transition-colors hover:bg-[#ffb59e]/10 sm:inline-flex"
      >
        Book now
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 rounded-none px-1 py-1 text-[#e5e2e1] transition-colors hover:text-[#ffb59e]">
            <span className="flex h-9 w-9 items-center justify-center border border-white/15 bg-[#1c1b1b] text-xs font-bold uppercase">
              {initials}
            </span>
            <span className="hidden text-sm font-bold uppercase tracking-tight sm:block">
              {user.name.split(" ")[0]}
            </span>
            <ChevronDown className="h-4 w-4 text-[#c4c7c7]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 rounded-none border-white/10 bg-[#1c1b1b] text-[#e5e2e1]">
          <DropdownMenuLabel className="font-normal">
            <p className="font-bold uppercase tracking-tight text-white">{user.name}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-[#c4c7c7]">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />

          <DropdownMenuItem asChild className="focus:bg-[#353535] focus:text-white">
            <Link href="/account"><User className="mr-2 h-4 w-4" /> My account</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="focus:bg-[#353535] focus:text-white">
            <Link href="/account/bookings"><Calendar className="mr-2 h-4 w-4" /> My bookings</Link>
          </DropdownMenuItem>
          {user.role?.isInstructor && (
            <DropdownMenuItem asChild className="focus:bg-[#353535] focus:text-white">
              <Link href="/account/instructor"><GraduationCap className="mr-2 h-4 w-4" /> Instructor console</Link>
            </DropdownMenuItem>
          )}
          {user.role?.canAccessDashboard && (
            <DropdownMenuItem asChild className="focus:bg-[#353535] focus:text-white">
              <Link href="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" /> Admin dashboard</Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem asChild className="focus:bg-[#353535] focus:text-white">
            <form action={signOut} className="w-full">
              <button type="submit" className="flex w-full items-center text-sm text-[#ffb4ab]">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
