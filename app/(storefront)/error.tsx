"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function StorefrontError({ reset }: { reset: () => void }) {
  return (
    <div className="sf-page"><div className="sf-container"><div className="max-w-2xl border border-[var(--sf-border)] bg-[var(--sf-surface)] p-8 sm:p-10"><TriangleAlert className="h-8 w-8 text-[var(--sf-primary)]" aria-hidden="true" /><h1 className="sf-display mt-7 text-4xl sm:text-5xl">We couldn’t load this page.</h1><p className="mt-5 leading-7 text-[var(--sf-muted)]">Try again in a moment. If you were booking a class or making a payment, check your account before repeating the action.</p><button type="button" className="sf-btn-secondary mt-8" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden="true" />Try again</button><a href="/account" className="sf-btn-secondary mt-8 ml-3">Check your account</a><a href="/contact" className="sf-link mt-6 block">Contact the club</a></div></div></div>
  );
}
