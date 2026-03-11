import Link from "next/link";
import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  if (!memberId) return;

  const mutation = `
    mutation SuspendMember($id: ID!) {
      updateMember(where: { id: $id }, data: { status: "suspended" }) {
        id
        status
      }
    }
  `;

  await keystoneClient(mutation, { id: memberId });
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

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Member Directory</h1>
          <p className="text-sm text-muted-foreground">
            Search members, manage statuses, and review activity at a glance.
          </p>
        </div>

        <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
          <form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input
              name="q"
              type="search"
              placeholder="Search name, email, or phone"
              defaultValue={query}
            />
            <select
              name="status"
              defaultValue={status || "all"}
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
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
            </select>
            <Input
              name="joinedFrom"
              type="date"
              defaultValue={joinedFrom}
            />
            <Input
              name="joinedTo"
              type="date"
              defaultValue={joinedTo}
            />
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5">
              <Button type="submit">Apply filters</Button>
              <Button asChild type="button" variant="secondary">
                <Link href="/dashboard/platform/members">Reset</Link>
              </Button>
            </div>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Showing {members.length} of {totalCount} members
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
              <Link
                href={
                  `/dashboard/platform/members?${buildSearchString(params, {
                    page: (currentPage - 1).toString(),
                  })}`
                }
              >
                Previous
              </Link>
            </Button>
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
            >
              <Link
                href={
                  `/dashboard/platform/members?${buildSearchString(params, {
                    page: (currentPage + 1).toString(),
                  })}`
                }
              >
                Next
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <MemberListPageClient
            members={members}
            viewProfileBasePath="/dashboard/Member"
            suspendMember={suspendMember}
          />
        </div>
      </div>
    </div>
  );
}
