"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { signOut } from "@/features/storefront/lib/data/user";
import Wordmark, { type WordmarkBrand } from "./wordmark";
import ThemeSwitch from "./theme-switch";

const NAV_LINKS = [
  { label: "Schedule", href: "/schedule" },
  { label: "Classes", href: "/classes" },
  { label: "Memberships", href: "/memberships" },
  { label: "Coaches", href: "/instructors" },
  { label: "Facilities", href: "/facilities" },
  { label: "Contact", href: "/contact" },
];

const MOBILE_NAV_LINKS = [
  { label: "Home", href: "/" },
  ...NAV_LINKS,
];

type NavCta = { label: string; href: string };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav() {
  const pathname = usePathname() || "";
  return (
    <nav className="sf-nav" aria-label="Primary navigation">
      {NAV_LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone header controls: a Book shortcut and the full-screen menu. Hidden from 1080px. */
export default function NavClient({
  user,
  brand,
  primaryCta,
  secondaryCta,
}: {
  user?: {
    name?: string | null;
    role?: { isInstructor?: boolean; canAccessDashboard?: boolean } | null;
  } | null;
  brand: WordmarkBrand;
  primaryCta?: NavCta | null;
  secondaryCta?: NavCta | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);
  const close = () => setOpen(false);
  const extraCtas = [user ? null : primaryCta, secondaryCta].filter(
    (cta): cta is NavCta => Boolean(cta) && !MOBILE_NAV_LINKS.some((link) => link.href === cta?.href),
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1080px)");
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
    // The menu is portalled to <body>, so the whole storefront behind it can be made inert.
    const background = document.querySelectorAll<HTMLElement>(".sf-root");
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

  function trapMenuFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
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
      {pathname !== "/schedule" ? (
        <Link href="/schedule" className="sf-btn sf-mobile-only" data-size="sm">Book</Link>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        aria-label="Open menu"
        aria-controls="storefront-mobile-menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="sf-icon-btn sf-mobile-only"
      >
        <Menu aria-hidden="true" />
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          id="storefront-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby="storefront-mobile-menu-title"
          className="sf-portal sf-drawer"
          onKeyDown={trapMenuFocus}
        >
          <div className="sf-drawer-head">
            <Wordmark brand={brand} onNavigate={close} />
            <span id="storefront-mobile-menu-title" className="sr-only">Menu</span>
            <button ref={closeRef} type="button" className="sf-icon-btn" aria-label="Close menu" onClick={close}>
              <X aria-hidden="true" />
            </button>
          </div>

          <div className="sf-drawer-body">
            <nav className="sf-drawer-nav" aria-label="Mobile navigation">
              {MOBILE_NAV_LINKS.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  style={{ "--i": index } as CSSProperties}
                  aria-current={isActive(pathname, link.href) ? "page" : undefined}
                >
                  {link.label}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <div className="sf-drawer-account">
              {user ? (
                <>
                  <Link href="/account" onClick={close} className="sf-btn" data-size="lg" data-block>Account</Link>
                  <div className="sf-row" data-gap="sm">
                    <Link href="/account/bookings" onClick={close} className="sf-btn" data-variant="secondary">Bookings</Link>
                    <Link href="/member/check-in-code" onClick={close} className="sf-btn" data-variant="secondary">Check-in code</Link>
                  </div>
                  {user.role?.isInstructor ? <Link href="/account/instructor" onClick={close} className="sf-btn" data-variant="secondary" data-block>Coach workspace</Link> : null}
                  {user.role?.canAccessDashboard ? <Link href="/dashboard" onClick={close} className="sf-btn" data-variant="secondary" data-block>Dashboard</Link> : null}
                  <form action={signOut}><button type="submit" className="sf-btn" data-variant="ghost" data-block>Sign out</button></form>
                </>
              ) : (
                <Link href="/account" onClick={close} className="sf-btn" data-variant="secondary" data-size="lg" data-block>Sign in</Link>
              )}
              {extraCtas.map((cta) => (
                <Link key={cta.href} href={cta.href} onClick={close} className="sf-btn" data-size="lg" data-block>{cta.label}</Link>
              ))}
            </div>

            <ThemeSwitch />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
