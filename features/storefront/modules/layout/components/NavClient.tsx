"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Menu } from "lucide-react";

const NAV_LINKS = [
  { label: "Classes", href: "/classes" },
  { label: "Schedule", href: "/schedule" },
  { label: "Memberships", href: "/memberships" },
  { label: "Instructors", href: "/instructors" },
  { label: "Facilities", href: "/facilities" },
  { label: "Contact", href: "/contact" },
];

export default function NavClient() {
  const [open, setOpen] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Desktop nav links */}
      <nav className="hidden items-center gap-7 md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-[family-name:var(--font-space-grotesk)] text-[11px] font-bold uppercase tracking-[0.1em] text-[#e5e2e1] transition-colors hover:text-[#818cf8]"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: hamburger button */}
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center text-[#e5e2e1] transition-colors hover:text-[#818cf8] md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-[#0e0e0e] transition-transform duration-300 ease-in-out md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer top accent */}
        <div className="h-[2px] w-full bg-[linear-gradient(90deg,#818cf8_0%,#4f46e5_100%)]" />

        <div className="flex items-center justify-between px-6 py-5">
          <span className="font-[family-name:var(--font-space-grotesk)] text-xs font-bold uppercase tracking-[0.3em] text-[#c4c7c7]">
            Menu
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="text-[#e5e2e1] hover:text-[#818cf8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col divide-y divide-white/10 border-t border-white/10">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-6 py-5 font-[family-name:var(--font-space-grotesk)] text-sm font-bold uppercase tracking-[0.12em] text-[#e5e2e1] transition-colors hover:bg-[#1c1b1b] hover:text-[#818cf8]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 p-6 space-y-3">
          <Link
            href="/join"
            onClick={() => setOpen(false)}
            className="gym-btn-primary block w-full text-center"
          >
            Join now
          </Link>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-bold uppercase tracking-[0.2em] text-[#c4c7c7] hover:text-[#818cf8] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </>
  );
}
