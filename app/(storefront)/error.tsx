"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function StorefrontError({ reset }: { reset: () => void }) {
  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        <span className="sf-outcome-mark" data-tone="warn"><TriangleAlert aria-hidden="true" /></span>
        <h1 className="sf-h1">This page didn’t load</h1>
        <p className="sf-lead">If you were booking or paying, check your account before trying again.</p>
        <div className="sf-actions">
          <button type="button" className="sf-btn" data-size="lg" onClick={reset}><RotateCcw aria-hidden="true" />Try again</button>
          <Link href="/account" className="sf-btn" data-variant="secondary" data-size="lg">Account</Link>
          <Link href="/contact" className="sf-btn" data-variant="ghost" data-size="lg">Contact</Link>
        </div>
      </div>
    </div>
  );
}
