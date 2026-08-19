import Link from "next/link";
import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { MemberInviteForm } from "../components/MemberInviteForm";
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
  notice?: string | string[];
  error?: string | string[];
};

const PAGE_SIZE = 18;

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: string; lte?: string } = {};
  if (from) {
    range.gte = new Date(`${from}T00:00:00.000Z`).toISOString();
  }
  if (to) {
    range.lte = new Date(`${to}T23:59:59.999Z`).toISOString();
  }
  return range;
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
  const resolvedSearchParams = await searchParams;
  const query = getParam(resolvedSearchParams.q).trim();
  const status = getParam(resolvedSearchParams.status);
  const tier = getParam(resolvedSearchParams.tier);
  const joinedFrom = getParam(resolvedSearchParams.joinedFrom);
  const joinedTo = getParam(resolvedSearchParams.joinedTo);
  const page = Math.max(1, parseInt(getParam(resolvedSearchParams.page) || "1", 10));
  const notice = getParam(resolvedSearchParams.notice);
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

  const joinDateRange = buildDateRange(joinedFrom || undefined, joinedTo || undefined);
  if (joinDateRange) {
    where.joinDate = joinDateRange;
  }

  const queryDocument = `
    query MemberDirectory($where: MemberWhereInput, $take: Int, $skip: Int) {
      members(where: $where, take: $take, skip: $skip, orderBy: [{ joinDate: desc }]) {
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
        membershipTier {
          id
          name
        }
      }
      membersCount(where: $where)
      membershipTiers(orderBy: [{ name: asc }]) {
        id
        name
      }
    }
  `;

  const response = await keystoneClient<{
    members: MemberSummary[];
    membersCount: number;
    membershipTiers: { id: string; name?: string | null }[];
  }>(queryDocument, {
    where,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const members = response.success ? response.data.members : [];
  const totalCount = response.success ? response.data.membersCount : 0;
  const membershipTiers = response.success ? response.data.membershipTiers : [];
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (tier) params.set("tier", tier);
  if (joinedFrom) params.set("joinedFrom", joinedFrom);
  if (joinedTo) params.set("joinedTo", joinedTo);
  params.set("page", currentPage.toString());

  const activeCount = members.filter((member) => (member.status ?? "active") === "active").length;
  const needsPlanCount = members.filter((member) => !member.membershipTier).length;
  const header = <div className="flex flex-col gap-1"><h1 className="text-lg font-semibold md:text-2xl">Member directory</h1><p className="text-muted-foreground">Find a member, verify account context, and move into the next operator task.</p></div>;
  const breadcrumbs = [{ type: "link" as const, label: "Dashboard", href: "/dashboard" }, { type: "page" as const, label: "Members" }];

  return (
    <PageContainer title="Members" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full min-w-0 space-y-5 p-4 md:p-6">
        {!response.success ? <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">The member directory could not be loaded. {response.error}</div> : null}
        <div className="grid grid-cols-3 divide-x rounded-lg border bg-card">
          <div className="p-3"><p className="text-xs text-muted-foreground">Matching members</p><p className="mt-1 text-2xl font-semibold tabular-nums">{totalCount}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Active on this page</p><p className="mt-1 text-2xl font-semibold tabular-nums">{activeCount}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">No plan on this page</p><p className="mt-1 text-2xl font-semibold tabular-nums">{needsPlanCount}</p></div>
        </div>

        {notice ? (
          <div className="mt-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice === "invite-sent"
              ? "Member account created. A secure password-setup email was sent. They can then sign in and choose a membership."
              : "Member account created, but the password-setup email could not be sent. Ask them to use Forgot password before sign-in."}
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}

        <MemberInviteForm />

        <div className="rounded-lg border bg-card p-4">
          <form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label><span className="sr-only">Search members</span><Input
              name="q"
              type="search"
              placeholder="Search name, email, or phone"
              defaultValue={query}
            /></label>
            <label><span className="sr-only">Filter by member status</span><select
              name="status"
              defaultValue={status || "all"}
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select></label>
            <label><span className="sr-only">Filter by membership tier</span><select
              name="tier"
              defaultValue={tier || "all"}
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All tiers</option>
              {membershipTiers.map((tierOption) => (
                <option key={tierOption.id} value={tierOption.id}>
                  {tierOption.name || "Unnamed"}
                </option>
              ))}
            </select></label>
            <label><span className="sr-only">Joined on or after</span><Input
              name="joinedFrom"
              type="date"
              defaultValue={joinedFrom}
            /></label>
            <label><span className="sr-only">Joined on or before</span><Input
              name="joinedTo"
              type="date"
              defaultValue={joinedTo}
            /></label>
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5">
              <Button type="submit">Apply filters</Button>
              <Button asChild type="button" variant="secondary">
                <Link href="/dashboard/platform/members">Reset</Link>
              </Button>
            </div>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Showing {members.length} of {totalCount} members
          </div>
          <div className="flex items-center gap-2 text-sm">
            {currentPage <= 1 ? <Button variant="outline" size="sm" disabled>Previous</Button> : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/platform/members?${buildSearchString(params, { page: (currentPage - 1).toString() })}`}>Previous</Link>
              </Button>
            )}
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            {currentPage >= totalPages ? <Button variant="outline" size="sm" disabled>Next</Button> : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/platform/members?${buildSearchString(params, { page: (currentPage + 1).toString() })}`}>Next</Link>
              </Button>
            )}
          </div>
        </div>

        <div>
          <MemberListPageClient
            members={members}
            viewProfileBasePath="/dashboard/Member"
            suspendMember={suspendMember}
          />
        </div>
      </div>
    </PageContainer>
  );
}
