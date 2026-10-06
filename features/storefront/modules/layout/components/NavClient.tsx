"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "@/features/storefront/lib/data/user";

const NAV_LINKS = [
  { label: "Timetable", href: "/schedule" },
  { label: "Classes", href: "/classes" },
  { label: "Membership", href: "/memberships" },
  { label: "Coaches", href: "/instructors" },
  { label: "Facility", href: "/facilities" },
];

const MOBILE_NAV_LINKS = [
  { label: "Home", href: "/" },
  ...NAV_LINKS,
  { label: "Contact", href: "/contact" },
];

type NavCta = { label: string; href: string };

export default function NavClient({
  user,
  primaryCta,
  secondaryCta,
}: {
  user?: {
    name?: string | null;
    role?: { isInstructor?: boolean; canAccessDashboard?: boolean } | null;
  } | null;
  primaryCta?: NavCta | null;
  secondaryCta?: NavCta | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1120px)");
    const closeOnDesktop = () => { if (query.matches) setOpen(false); };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const background = document.querySelectorAll<HTMLElement>(
      "main, footer, .sf-wordmark, .sf-auth-nav",
    );
    document.body.style.overflow = open ? "hidden" : "";
    background.forEach((element) => {
      element.inert = open;
    });

    if (open) {
      hasOpened.current = true;
      closeRef.current?.focus();
    } else if (hasOpened.current) {
      triggerRef.current?.focus();
    }

    return () => {
      document.body.style.overflow = "";
      background.forEach((element) => {
        element.inert = false;
      });
    };
  }, [open]);

  function trapMenuFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <nav className="sf-desktop-nav" aria-label="Primary navigation">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="sf-nav-link"
            data-active={pathname === link.href || pathname.startsWith(`${link.href}/`)}
            aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        className="sf-theme-toggle"
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label={dark ? "Use light theme" : "Use dark theme"}
      >
        {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </button>

      <button
        ref={triggerRef}
        type="button"
        aria-label="Open menu"
        aria-controls="storefront-mobile-menu"
        aria-expanded={open}
        aria-hidden={open}
        disabled={open}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen(true)}
        className={`sf-menu-trigger ${open ? "invisible pointer-events-none" : ""}`}
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <div
          className="sf-mobile-backdrop fixed inset-0 z-40 bg-[var(--sf-ink)]/45 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
        <div
          ref={menuRef}
          id="storefront-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby="storefront-mobile-menu-title"
          className="sf-mobile-menu"
          onKeyDown={trapMenuFocus}
        >
          <div className="sf-mobile-menu-header">
            <span id="storefront-mobile-menu-title" className="sf-eyebrow">Menu</span>
            <button ref={closeRef} type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-col" aria-label="Mobile navigation">
            {MOBILE_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="sf-mobile-nav-link"
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-3 border-t border-[var(--sf-rule)] p-6">
            {user ? (
              <>
                <Link href="/account" onClick={() => setOpen(false)} className="sf-btn-primary w-full">Member account</Link>
                <Link href="/account/bookings" onClick={() => setOpen(false)} className="sf-btn-secondary w-full">My bookings</Link>
                {user.role?.isInstructor ? <Link href="/account/instructor" onClick={() => setOpen(false)} className="sf-btn-secondary w-full">Instructor console</Link> : null}
                {user.role?.canAccessDashboard ? <Link href="/dashboard" onClick={() => setOpen(false)} className="sf-btn-secondary w-full">Admin dashboard</Link> : null}
                <form action={signOut}><button type="submit" className="sf-btn-ghost w-full py-2">Sign out</button></form>
              </>
            ) : (
              <Link href="/account" onClick={() => setOpen(false)} className="sf-btn-primary w-full">Member sign in</Link>
            )}
            {!user && primaryCta && !MOBILE_NAV_LINKS.some((link) => link.href === primaryCta.href) ? <Link href={primaryCta.href} onClick={() => setOpen(false)} className="sf-btn-secondary w-full">{primaryCta.label}</Link> : null}
            {secondaryCta && !MOBILE_NAV_LINKS.some((link) => link.href === secondaryCta.href) ? <Link href={secondaryCta.href} onClick={() => setOpen(false)} className="sf-btn-secondary w-full">{secondaryCta.label}</Link> : null}
            <button type="button" className="sf-mobile-theme-toggle" onClick={() => setTheme(dark ? "light" : "dark")}>
              {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              {dark ? "Use light theme" : "Use dark theme"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
