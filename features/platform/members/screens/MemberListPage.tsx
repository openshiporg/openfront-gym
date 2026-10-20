import Link from "next/link";
import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import {
  FieldInput,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PlatformBody,
  PlatformHeader,
  SearchField,
  SegmentedLinks,
} from "@/features/platform/components/platform-ui";
import { MemberInviteForm } from "../components/MemberInviteForm";
import { requirePeopleManager } from "@/features/platform/lib/current-user";
import { normalizeDashboardListPagination } from "@/lib/list-pagination";
import MemberListPageClient, {
  type MemberSummary,
} from "./MemberListPageClient";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  tier?: string | string[];
  joinedFrom?: string | string[];
  joinedTo?: string | string[];
  page?: string | string[];
  error?: string | string[];
};

const PAGE_SIZE = 18;

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** A real YYYY-MM-DD calendar date (no rollover such as 2026-02-31), else null. */
function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function buildDateRange(from: string, to: string): { range?: { gte?: string; lte?: string }; error?: string } {
  if (!from && !to) return {};
  const start = from ? calendarDate(from) : null;
  const end = to ? calendarDate(to) : null;
  if ((from && !start) || (to && !end)) return { error: "Joined dates must be real dates (YYYY-MM-DD); the date filter was ignored." };
  if (start && end && start > end) return { error: "Joined from must be on or before joined to; the date filter was ignored." };
  return { range: { ...(start ? { gte: start.toISOString() } : {}), ...(end ? { lte: new Date(`${to}T23:59:59.999Z`).toISOString() } : {}) } };
}

function buildSearchString(params: URLSearchParams, updates: Record<string, string>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(updates).forEach(([key, value]) => {
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });
  return next.toString();
}

async function suspendMember(formData: FormData) {
  "use server";

  const memberId = formData.get("memberId")?.toString();
  const status = formData.get("status")?.toString();
  if (!memberId || !["active", "suspended", "cancelled"].includes(status || "")) return;

  const mutation = `
    mutation SetMemberAccountStatus($id: ID!, $status: String!) {
      setMemberAccountStatus(memberId: $id, status: $status) { id status }
    }
  `;

  const response = await keystoneClient(mutation, { id: memberId, status });
  if (!response.success) throw new Error(response.error);
  revalidatePath("/dashboard/platform/members");
}

export default async function MemberListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePeopleManager();
  // Directory readers keep search and profiles; invite, suspend and close need people management.
  const canManagePeople = Boolean(user.role?.canManagePeople);
  const resolvedSearchParams = await searchParams;
  const query = getParam(resolvedSearchParams.q).trim();
  const status = getParam(resolvedSearchParams.status);
  const tier = getParam(resolvedSearchParams.tier);
  const joinedFrom = getParam(resolvedSearchParams.joinedFrom);
  const joinedTo = getParam(resolvedSearchParams.joinedTo);
  const requestedPage = normalizeDashboardListPagination(getParam(resolvedSearchParams.page), PAGE_SIZE, PAGE_SIZE).page;
  const error = getParam(resolvedSearchParams.error);

  const where: Record<string, unknown> = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
    ];
  }

  if (status && status !== "all") {
    where.status = { equals: status };
  }

  if (tier && tier !== "all") {
    where.membershipTier = { id: { equals: tier } };
  }

  const joinDates = buildDateRange(joinedFrom, joinedTo);
  if (joinDates.range) {
    where.joinDate = joinDates.range;
  }

  // Count first, then load the page that is actually shown, so the label and rows agree.
  const counted = await keystoneClient<{ membersCount: number; membershipTiers: { id: string; name?: string | null }[] }>(`
    query MemberDirectoryCount($where: MemberWhereInput) {
      membersCount(where: $where)
      membershipTiers(orderBy: [{ name: asc }]) { id name }
    }
  `, { where });
  const totalCount = counted.success ? counted.data.membersCount : 0;
  const membershipTiers = counted.success ? counted.data.membershipTiers : [];
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const queryDocument = `
    query MemberDirectory($where: MemberWhereInput, $take: Int, $skip: Int) {
      members(where: $where, take: $take, skip: $skip, orderBy: [{ joinDate: desc }, { id: asc }]) {
        id
        name
        email
        phone
        status
        joinDate
        lastCheckIn
        bookingsCount
        paymentsCount
        checkInsCount
        user {
          id
        }
        membershipTier {
          id
          name
        }
      }
    }
  `;

  const response = counted.success
    ? await keystoneClient<{ members: MemberSummary[] }>(queryDocument, { where, take: PAGE_SIZE, skip: (currentPage - 1) * PAGE_SIZE })
    : counted;
  const members = response.success ? (response.data as { members: MemberSummary[] }).members : [];

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (tier) params.set("tier", tier);
  if (joinedFrom) params.set("joinedFrom", joinedFrom);
  if (joinedTo) params.set("joinedTo", joinedTo);
  params.set("page", currentPage.toString());


  const hasFilters = Boolean(query || (status && status !== "all") || (tier && tier !== "all") || joinedFrom || joinedTo);
  const basePath = "/dashboard/platform/members";
  const statusHref = (value: string) => `${basePath}?${buildSearchString(params, { status: value, page: "" })}`;
  const firstShown = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = (currentPage - 1) * PAGE_SIZE + members.length;

  const header = (
    <PlatformHeader
      title="Members"
      description="Find members, review their plan and account status, and invite new members."
      actions={
        <>
          {/* Every member field, filter, sort and column through the shared list workflow. */}
          <Button asChild variant="outline"><Link href="/dashboard/members">All fields and filters</Link></Button>
          {canManagePeople ? <MemberInviteForm /> : null}
        </>
      }
    />
  );
  const breadcrumbs = [{ type: "link" as const, label: "Dashboard", href: "/dashboard" }, { type: "page" as const, label: "Platform" }, { type: "page" as const, label: "Members" }];

  return (
    <PageContainer title="Members" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>

        {joinDates.error ? <Notice tone="warning">{joinDates.error}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <Panel>
          <div className="flex flex-col gap-3 border-b p-3 sm:px-4">
            <SegmentedLinks
              label="Filter by account status"
              items={[
                { label: "All", href: statusHref("all"), active: !status || status === "all" },
                { label: "Active", href: statusHref("active"), active: status === "active" },
                { label: "Suspended", href: statusHref("suspended"), active: status === "suspended" },
                { label: "Cancelled", href: statusHref("cancelled"), active: status === "cancelled" },
              ]}
            />
            <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_10rem_auto]">
              {status && status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
              <SearchField name="q" defaultValue={query} label="Search members" placeholder="Search name, email, or phone" className="sm:col-span-2 lg:col-span-1" />
              <label>
                <span className="sr-only">Filter by membership plan</span>
                <NativeSelect name="tier" defaultValue={tier || "all"}>
                  <option value="all">All plans</option>
                  {membershipTiers.map((tierOption) => (
                    <option key={tierOption.id} value={tierOption.id}>
                      {tierOption.name || "Unnamed"}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="relative">
                <span className="pointer-events-none absolute -top-2 left-2 bg-card px-1 text-[10px] font-medium text-muted-foreground">Joined from</span>
                <FieldInput name="joinedFrom" type="date" defaultValue={joinedFrom} aria-label="Joined on or after" />
              </label>
              <label className="relative">
                <span className="pointer-events-none absolute -top-2 left-2 bg-card px-1 text-[10px] font-medium text-muted-foreground">Joined to</span>
                <FieldInput name="joinedTo" type="date" defaultValue={joinedTo} aria-label="Joined on or before" />
              </label>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                <Button type="submit" className="flex-1 lg:flex-none">Apply</Button>
                {hasFilters ? (
                  <Button asChild variant="ghost">
                    <Link href={basePath}>Reset</Link>
                  </Button>
                ) : null}
              </div>
            </form>
          </div>

          {!response.success ? (
            // A failed load is not an empty directory: no member count, rows or empty state is claimed.
            <div className="px-4 py-6 sm:px-5">
              <Notice tone="danger" title="The member directory could not be loaded" action={<Button asChild size="sm" variant="outline"><Link href={`${basePath}?${params.toString()}`}>Try again</Link></Button>}>
                Members, their status and counts are unknown until it loads.
              </Notice>
            </div>
          ) : (
            <>
              <MemberListPageClient
                members={members}
                viewProfileBasePath="/dashboard/members"
                suspendMember={suspendMember}
                canManagePeople={canManagePeople}
                hasFilters={hasFilters}
                resetHref={basePath}
              />

              <div className="border-t px-4 py-3">
                <PaginationBar
                  summary={totalCount ? `Showing ${firstShown}–${lastShown} of ${totalCount} members` : "No members to show"}
                  pageLabel={`Page ${currentPage} of ${totalPages}`}
                  previousHref={currentPage > 1 ? `${basePath}?${buildSearchString(params, { page: (currentPage - 1).toString() })}` : null}
                  nextHref={currentPage < totalPages ? `${basePath}?${buildSearchString(params, { page: (currentPage + 1).toString() })}` : null}
                />
              </div>
            </>
          )}
        </Panel>
      </PlatformBody>
    </PageContainer>
  );
}
