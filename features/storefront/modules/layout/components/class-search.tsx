"use client"

import Link from "next/link"
import { Search } from "lucide-react"

/**
 * Honest catalog entry point. The launch storefront does not expose a
 * tenant-backed full-text search operation yet, so this control must never
 * synthesize classes or route visitors to fabricated IDs.
 */
export default function ClassSearch() {
  return (
    <Link
      href="/classes"
      className="rounded-md p-2 transition-colors hover:bg-muted"
      aria-label="Browse classes"
      title="Browse classes"
    >
      <Search className="h-5 w-5 text-muted-foreground" />
    </Link>
  )
}
