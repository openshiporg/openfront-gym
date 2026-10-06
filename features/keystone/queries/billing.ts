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
    throw new Error("Billing currency settings do not match the supported USD contract; reconcile Organization and Gym Settings before reporting.");
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

export async function getBillingWorkspace(root: unknown, args: unknown, context: KeystoneContext) {
  if (!context.session?.data?.role?.canManageAllRecords) throw new Error("Operator access required");
  const organizationId = getTenantId(context.session as any);
  if (!organizationId) throw new Error("Organization context required");
  const tenant = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const [
    stats,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
  ] = await Promise.all([
    getBillingStats(root, args, context),
    sudo.query.MembershipPayment.findMany({ where: tenant, take: 10, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount status paymentDate paymentType member { id name }" }),
    sudo.query.Subscription.findMany({ where: tenant, take: 10, orderBy: [{ startDate: "desc" }], query: "id status startDate member { id name } membershipTier { name }" }),
    sudo.query.Membership.findMany({ where: { AND: [tenant, { status: { in: ["active", "frozen", "past-due"] } }] }, take: 50, orderBy: [{ updatedAt: "desc" }], query: "id status billingCycle stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.MembershipTier.findMany({ where: tenant, take: 100, orderBy: [{ monthlyPrice: "asc" }], query: "id name" }),
    sudo.query.Membership.findMany({ where: { AND: [tenant, { status: { equals: "past-due" } }] }, take: 8, orderBy: [{ updatedAt: "desc" }], query: "id status nextBillingDate stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.GymPayment.findMany({ where: { AND: [tenant, { status: { equals: "succeeded" } }] }, take: 20, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount paymentDate receiptNumber description member { id name email }" }),
    sudo.query.MembershipPayment.findMany({ where: { AND: [tenant, { status: { equals: "failed" } }] }, take: 8, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode paymentDate description membership { id member { id name email } }" }),
  ]);
  return {
    stats,
    timeZone: stats.timeZone,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
  };
}
