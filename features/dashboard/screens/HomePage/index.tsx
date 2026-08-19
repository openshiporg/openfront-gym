/**
 * HomePage for Dashboard 2 - Server Component
 * Follows Dashboard1's server-side rendering approach
 */

import React from 'react'
import Link from 'next/link'
import { ChevronDown, PlusIcon, Database } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer } from '../../components/PageContainer'
import { getAdminMetaAction, getListCounts } from '../../actions'
import { cn } from '@/lib/utils'
import { platformNavGroups, platformStandaloneItems } from '@/features/platform/lib/navigation'

interface ListCardProps {
  list: any
  count?: number | null
  hideCreate?: boolean
}

type PlatformItem = {
  title: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
}

type PlatformGroup = {
  id: string
  title: string
  icon?: React.ComponentType<{ className?: string }>
  items: PlatformItem[]
}

function getDashboardHref(href: string) {
  if (href.startsWith('/dashboard')) return href
  return `/dashboard${href.startsWith('/') ? href : `/${href}`}`
}

function ListCard({ list, count, hideCreate = false }: ListCardProps) {
  const isSingleton = list.isSingleton || false
  const href = `/dashboard/${list.path}${isSingleton ? '/1' : ''}`

  return (
    <Card className={cn(
      'relative bg-gradient-to-bl from-background to-muted/80 shadow-xs hover:bg-muted transition-colors'
    )}>
      <Link href={href}>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {list.label}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSingleton
              ? 'Singleton'
              : count === null || count === undefined
                ? 'Unknown'
                : `${count} item${count !== 1 ? 's' : ''}`
            }
          </p>
        </CardContent>
      </Link>

      {!hideCreate && !isSingleton && (
        <Link
          href={`/dashboard/${list.path}/create`}
          className="absolute top-3 right-3"
        >
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title={`Add ${list.singular?.toLowerCase() || 'item'}`}
          >
            <PlusIcon className="h-4 w-4" />
            <span className="sr-only">Create new {list.label}</span>
          </Button>
        </Link>
      )}
    </Card>
  )
}

function PlatformLinkCard({ item }: { item: PlatformItem }) {
  const Icon = item.icon || Database

  return (
    <Card className={cn(
      'relative bg-gradient-to-bl from-background to-muted/80 shadow-xs hover:bg-muted transition-colors'
    )}>
      <Link href={getDashboardHref(item.href)}>
        <CardContent className="flex items-center gap-3 p-4">
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {item.title}
          </h3>
        </CardContent>
      </Link>
    </Card>
  )
}

function PlatformDropdownCard({ group }: { group: PlatformGroup }) {
  const Icon = group.icon || Database
  const items = group.items || []

  if (items.length === 0) return null

  return (
    <details className="group/platform relative">
      <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
        <Card className={cn(
          'relative bg-gradient-to-bl from-background to-muted/80 shadow-xs hover:bg-muted transition-colors'
        )}>
          <CardContent className="flex items-center gap-3 p-4">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {group.title}
            </h3>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/platform:rotate-180" />
          </CardContent>
        </Card>
      </summary>

      <Card className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden bg-card shadow-lg">
        <div className="space-y-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={getDashboardHref(item.href)}
              className="block rounded-lg px-4 py-3 text-sm font-medium leading-5 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          ))}
        </div>
      </Card>
    </details>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Database className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">No lists configured</h3>
      <p className="text-muted-foreground">
        There are no data models configured in your admin interface.
      </p>
    </div>
  )
}

export async function HomePage() {
  const adminMetaResponse = await getAdminMetaAction()

  if (!adminMetaResponse.success) {
    console.error('Failed to fetch admin meta:', adminMetaResponse.error)
    return (
      <PageContainer
        title="Dashboard"
        header={<h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>}
        breadcrumbs={[{ type: 'page' as const, label: 'Dashboard' }]}
      >
        <EmptyState />
      </PageContainer>
    )
  }

  const adminMeta = adminMetaResponse.data
  const lists = adminMeta?.lists || []
  const enhancedLists = lists.filter((list: any) => !list.isHidden)

  let countData: Record<string, number | null> = {}
  if (enhancedLists.length > 0) {
    const countResponse = await getListCounts(enhancedLists)
    if (countResponse.success && countResponse.data) {
      countData = countResponse.data
    }
  }

  const standaloneItems = (platformStandaloneItems || []) as PlatformItem[]
  const groupedSections = ((platformNavGroups || []) as PlatformGroup[]).filter((group) => group.items?.length > 0)
  const hasPlatformPages = standaloneItems.length > 0 || groupedSections.length > 0

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>
      {enhancedLists.length > 0 && (
        <p className="text-muted-foreground">{enhancedLists.length} Models</p>
      )}
    </div>
  )

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard' }
  ]

  if (enhancedLists.length === 0 && !hasPlatformPages) {
    return (
      <PageContainer title="Dashboard" header={header} breadcrumbs={breadcrumbs}>
        <EmptyState />
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Dashboard" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-4xl p-4 md:p-6 flex flex-col gap-4">
        {hasPlatformPages && (
          <div className="mb-4">
            <h2 className="tracking-wide uppercase font-medium mb-2 text-muted-foreground text-sm">
              Platform Pages
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-4">
              {standaloneItems.map((item) => (
                <PlatformLinkCard key={item.href} item={item} />
              ))}
              {groupedSections.map((group) => (
                <PlatformDropdownCard key={group.id} group={group} />
              ))}
            </div>
          </div>
        )}

        {enhancedLists.length > 0 ? (
          <div className="mb-4">
            <h2 className="tracking-wide uppercase font-medium mb-2 text-muted-foreground text-sm">
              Data Models
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-4">
              {enhancedLists.map((list: any) => (
                <ListCard
                  key={list.key}
                  list={list}
                  count={countData[list.key] ?? null}
                  hideCreate={list.hideCreate ?? false}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </PageContainer>
  )
}

export default HomePage
