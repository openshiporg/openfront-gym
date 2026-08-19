"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Classes", href: "/classes" },
  { label: "Schedule", href: "/schedule" },
  { label: "Membership", href: "/memberships" },
  { label: "Coaches", href: "/instructors" },
  { label: "Facility", href: "/facilities" },
];

type NavCta = { label: string; href: string };

export default function NavClient({
  primaryCta,
  secondaryCta,
}: {
  primaryCta?: NavCta | null;
  secondaryCta?: NavCta | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav className="sf-desktop-nav" aria-label="Primary navigation">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="sf-nav-link"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="sf-menu-trigger"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-[var(--sf-ink)]/45 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
        <div className="sf-mobile-menu">
          <div className="sf-mobile-menu-header">
            <span className="sf-eyebrow">Menu</span>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-col" aria-label="Mobile navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="sf-mobile-nav-link"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {primaryCta || secondaryCta ? (
            <div className="mt-auto space-y-3 border-t border-[var(--sf-rule)] p-6">
              {primaryCta ? (
                <Link href={primaryCta.href} onClick={() => setOpen(false)} className="sf-btn-primary w-full">
                  {primaryCta.label}
                </Link>
              ) : null}
              {secondaryCta ? (
                <Link href={secondaryCta.href} onClick={() => setOpen(false)} className="sf-btn-secondary w-full">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
