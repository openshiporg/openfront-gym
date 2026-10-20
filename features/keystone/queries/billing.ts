import { KeystoneContext } from "@keystone-6/core/types";
import { getTenantId } from "../access/tenantPolicy";
import { resolveGymTimeZone, zonedStartOfMonth } from "../../../lib/timezone";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

export async function getBillingStats(
  _root: unknown,
  _args: unknown,
  context: KeystoneContext,
) {
  if (!context.session?.data?.role?.canManageAllRecords) {
    throw new Error("Operator access required");
  }
  const organizationId = getTenantId(context.session as any);
  if (!organizationId) throw new Error("Organization context required");

  const now = new Date();
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const [settings, organization] = await Promise.all([
    prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, timezone: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, defaultCurrency: true },
    }),
  ]);
  const currencyCode = String(settings?.currencyCode || "USD").toUpperCase();
  if (currencyCode !== "USD" || String(organization?.defaultCurrency || "USD").toUpperCase() !== currencyCode) {
    throw new Error("Billing currency settings do not match the supported USD contract; reconcile Organization and Store Settings before reporting.");
  }
  const receiptCurrencies = await prisma.membershipPayment.groupBy({ by: ["currencyCode"], where: { organizationId, status: { in: ["completed", "refunded"] } }, _count: { _all: true } });
  if (receiptCurrencies.some((row: any) => String(row.currencyCode || "").toUpperCase() !== currencyCode)) {
    throw new Error("Settled receipt currencies are outside the supported USD report scope; reconcile receipt history before reporting.");
  }
  const timeZone = resolveGymTimeZone(settings?.timezone, organization?.timezone);
  const startOfMonth = zonedStartOfMonth(now, timeZone);
  const [
    activeSubscriptions,
    activeMemberships,
    pastDueMemberships,
    completedPayments,
    monthlyPayments,
  ] = await Promise.all([
    prisma.subscription.count({ where: { organizationId, status: "active" } }),
    prisma.membership.count({ where: { organizationId, status: "active" } }),
    prisma.membership.count({ where: { organizationId, status: "past-due" } }),
    prisma.membershipPayment.aggregate({
      where: { organizationId, currencyCode, status: { in: ["completed", "refunded"] } },
      _sum: { amount: true, refundAmount: true },
    }),
    prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode,
        status: { in: ["completed", "refunded"] },
        paymentDate: { gte: startOfMonth, lte: now },
      },
      _sum: { amount: true, refundAmount: true },
    }),
  ]);

  return {
    totalRevenue: (completedPayments._sum.amount ?? 0) - (completedPayments._sum.refundAmount ?? 0),
    monthlyRevenue: (monthlyPayments._sum.amount ?? 0) - (monthlyPayments._sum.refundAmount ?? 0),
    currencyCode,
    timeZone,
    activeSubscriptions,
    activeMemberships,
    pastDueCount: pastDueMemberships,
  };
}

const BILLING_QUEUE_PAGE = 20;
const BILLING_TIER_PAGE = 100;

type BillingWorkspaceArgs = {
  q?: string | null; recoverySkip?: number | null; failedSkip?: number | null; planSkip?: number | null; refundSkip?: number | null;
  tierQuery?: string | null; tierSkip?: number | null; pinnedTierId?: string | null;
};

/**
 * Billing action queues are complete: each is searchable by member name or email and paged with
 * its own total (an offset past the end is moved to the last page), so an older record is
 * reachable. Plan choices are searched and paged on the server, and a plan already chosen for a
 * pending change is always included by id. Recent payments and subscriptions stay a preview.
 */
export async function getBillingWorkspace(root: unknown, args: BillingWorkspaceArgs, context: KeystoneContext) {
  if (!context.session?.data?.role?.canManageAllRecords) throw new Error("Operator access required");
  const organizationId = getTenantId(context.session as any);
  if (!organizationId) throw new Error("Organization context required");
  const tenant = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const q = typeof args?.q === "string" ? args.q.trim().slice(0, 100) : "";
  const offset = (value: unknown) => Number.isSafeInteger(value) ? Math.min(Math.max(0, value as number), 1_000_000) : 0;
  const person = (path: (match: any) => any) => q ? [{ OR: [
    path({ name: { contains: q, mode: "insensitive" } }),
    path({ email: { contains: q, mode: "insensitive" } }),
  ] }] : [];
  const where = {
    plans: { AND: [tenant, { status: { in: ["active", "frozen", "past-due"] } }, ...person((match) => ({ member: match }))] },
    recovery: { AND: [tenant, { status: { equals: "past-due" } }, ...person((match) => ({ member: match }))] },
    refunds: { AND: [tenant, { status: { equals: "succeeded" } }, ...person((match) => ({ member: match }))] },
    failed: { AND: [tenant, { status: { equals: "failed" } }, ...person((match) => ({ membership: { member: match } }))] },
  };
  const [planTotal, recoveryTotal, refundTotal, failedTotal] = await Promise.all([
    sudo.query.Membership.count({ where: where.plans }),
    sudo.query.Membership.count({ where: where.recovery }),
    sudo.query.GymPayment.count({ where: where.refunds }),
    sudo.query.MembershipPayment.count({ where: where.failed }),
  ]);
  // A requested offset past the end shows the last page instead of a false empty queue.
  const clamp = (requested: unknown, total: number) => Math.min(offset(requested), total > 0 ? Math.floor((total - 1) / BILLING_QUEUE_PAGE) * BILLING_QUEUE_PAGE : 0);
  const skip = { plans: clamp(args?.planSkip, planTotal), recovery: clamp(args?.recoverySkip, recoveryTotal), refunds: clamp(args?.refundSkip, refundTotal), failed: clamp(args?.failedSkip, failedTotal) };
  const tierQuery = typeof args?.tierQuery === "string" ? args.tierQuery.trim().slice(0, 100) : "";
  const tierWhere = { AND: [tenant, ...(tierQuery ? [{ name: { contains: tierQuery, mode: "insensitive" } }] : [])] };
  const tierSkip = offset(args?.tierSkip);
  const pinnedTierId = typeof args?.pinnedTierId === "string" && args.pinnedTierId ? args.pinnedTierId.slice(0, 100) : null;
  const [
    stats,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    tierRows,
    pinnedTiers,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
  ] = await Promise.all([
    getBillingStats(root, args, context),
    sudo.query.MembershipPayment.findMany({ where: tenant, take: 10, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount status paymentDate paymentType member { id name }" }),
    sudo.query.Subscription.findMany({ where: tenant, take: 10, orderBy: [{ startDate: "desc" }], query: "id status startDate member { id name } membershipTier { name }" }),
    sudo.query.Membership.findMany({ where: where.plans, skip: skip.plans, take: BILLING_QUEUE_PAGE, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], query: "id status billingCycle stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.MembershipTier.findMany({ where: tierWhere, skip: tierSkip, take: BILLING_TIER_PAGE + 1, orderBy: [{ name: "asc" }, { id: "asc" }], query: "id name" }),
    pinnedTierId ? sudo.query.MembershipTier.findMany({ where: { AND: [tenant, { id: { equals: pinnedTierId } }] }, take: 1, query: "id name" }) : Promise.resolve([]),
    sudo.query.Membership.findMany({ where: where.recovery, skip: skip.recovery, take: BILLING_QUEUE_PAGE, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], query: "id status nextBillingDate stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.GymPayment.findMany({ where: where.refunds, skip: skip.refunds, take: BILLING_QUEUE_PAGE, orderBy: [{ paymentDate: "desc" }, { id: "asc" }], query: "id amount currencyCode refundAmount paymentDate receiptNumber description member { id name email }" }),
    sudo.query.MembershipPayment.findMany({ where: where.failed, skip: skip.failed, take: BILLING_QUEUE_PAGE, orderBy: [{ paymentDate: "desc" }, { id: "asc" }], query: "id amount currencyCode paymentDate description membership { id member { id name email } }" }),
  ]);
  const availableTiers = tierRows.slice(0, BILLING_TIER_PAGE);
  for (const tier of pinnedTiers) if (!availableTiers.some((row: any) => row.id === tier.id)) availableTiers.unshift(tier);
  return {
    stats,
    timeZone: stats.timeZone,
    q,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    tierSearch: { query: tierQuery, skip: tierSkip, hasMore: tierRows.length > BILLING_TIER_PAGE, pageSize: BILLING_TIER_PAGE },
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
    queues: {
      pageSize: BILLING_QUEUE_PAGE,
      plans: { total: planTotal, skip: skip.plans },
      recovery: { total: recoveryTotal, skip: skip.recovery },
      refunds: { total: refundTotal, skip: skip.refunds },
      failed: { total: failedTotal, skip: skip.failed },
    },
  };
}
