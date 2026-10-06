import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";

export default function StorefrontNotFound() {
  return (
    <div className="sf-page"><div className="sf-container"><div className="max-w-2xl border border-[var(--sf-border)] bg-[var(--sf-surface)] p-8 sm:p-10"><MapPinned className="h-8 w-8 text-[var(--sf-primary)]" aria-hidden="true" /><h1 className="sf-display mt-7 text-5xl">That page is unavailable.</h1><p className="mt-5 leading-7 text-[var(--sf-muted)]">The class, coach, or page may no longer be in the published gym catalog.</p><Link href="/" className="sf-btn-secondary mt-8"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Club home</Link><Link href="/schedule" className="sf-btn-primary mt-8 ml-3">Find a session</Link></div></div></div>
  );
}
