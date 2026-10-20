'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { PlatformBody } from './platform-ui'

function SkeletonPanel({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="space-y-2 border-b px-5 py-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Route-level skeleton that mirrors the platform page anatomy to avoid layout jump. */
export function PlatformLoading() {
  return (
    <PageContainer
      header={
        <div className="space-y-2 pt-1" aria-hidden>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      }
    >
      <PlatformBody>
        <p className="sr-only" role="status">
          Loading workspace…
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 bg-card px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]" aria-hidden>
          <SkeletonPanel rows={6} />
          <SkeletonPanel rows={3} />
        </div>
      </PlatformBody>
    </PageContainer>
  )
}

export function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PageContainer
      breadcrumbs={[
        { type: 'link', label: 'Dashboard', href: '/dashboard' },
        { type: 'page', label: 'Platform' },
      ]}
    >
      <PlatformBody>
        <div role="alert" className="mx-auto mt-6 max-w-lg rounded-xl border bg-card px-6 py-10 text-center shadow-xs">
          <span className="mx-auto grid size-11 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
            <TriangleAlert className="size-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">This workspace could not load</h1>
          <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
            The data request failed or your role does not include access to it. Nothing was changed. Retry, or return to
            the dashboard and reopen the page.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">Reference {error.digest}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={reset}>
              <RotateCcw aria-hidden /> Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </PlatformBody>
    </PageContainer>
  )
}
