import { resolveGymTimeZone, zonedStartOfDay, zonedStartOfMonth, zonedStartOfNextDay } from "../../../lib/timezone";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

function reportManager(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || (!session.data?.role?.canViewReports && !session.data?.role?.canManageAllRecords)) {
    throw new Error("Report access required");
  }
  return organizationId as string;
}

function toPercent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export async function getReportsDashboard(_root: unknown, _args: unknown, context: any) {
  const organizationId = reportManager(context);
  const organizationWhere = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
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
  const timeZone = resolveGymTimeZone(settings?.timezone, organization?.timezone);
  const reportCurrency = String(settings?.currencyCode || "USD").toUpperCase();
  if (reportCurrency !== "USD" || String(organization?.defaultCurrency || "USD").toUpperCase() !== reportCurrency) {
    throw new Error("Report currency settings do not match the supported USD contract; reconcile Organization and Gym Settings before reporting.");
  }
  const receiptCurrencies = await prisma.membershipPayment.groupBy({ by: ["currencyCode"], where: { organizationId, status: { in: ["completed", "refunded"] } }, _count: { _all: true } });
  if (receiptCurrencies.some((row: any) => String(row.currencyCode || "").toUpperCase() !== reportCurrency)) {
    throw new Error("Settled receipt currencies are outside the supported USD report scope; reconcile receipt history before reporting.");
  }
  const todayStart = zonedStartOfDay(now, timeZone);
  const todayEnd = zonedStartOfNextDay(now, timeZone);
  const monthStart = zonedStartOfMonth(now, timeZone);
  const soonThreshold = new Date(now.getTime() + 90 * 60 * 1000);
  const attendanceWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    activeMembers,
    todayCheckIns,
    upcomingSessionsToday,
    liveOrStartingSoon,
    pastDueMemberships,
    completedPaymentAggregate,
    monthlyPaymentAggregate,
    totalMarked,
    attendedCount,
    lateCount,
    noShowCount,
    upcomingInstances,
    activeMembershipMembers,
  ] = await Promise.all([
    prisma.member.count({ where: { organizationId, status: 'active', user: { membership: {
      status: 'active', OR: [
        { creditPeriodStart: { lte: now }, creditPeriodEnd: { gt: now } },
        { creditPeriodEnd: null, startDate: { lte: now }, nextBillingDate: { gt: now } },
      ],
    } } } }),
    sudo.query.CheckIn.count({ where: { ...organizationWhere, checkInTime: { gte: todayStart.toISOString(), lt: todayEnd.toISOString() } } }),
    sudo.query.ClassInstance.count({ where: { ...organizationWhere, date: { gte: todayStart.toISOString(), lt: todayEnd.toISOString() }, isCancelled: { equals: false } } }),
    sudo.query.ClassInstance.count({ where: { ...organizationWhere, date: { gte: now.toISOString(), lte: soonThreshold.toISOString() }, isCancelled: { equals: false } } }),
    sudo.query.Membership.count({ where: { ...organizationWhere, status: { equals: "past-due" } } }),
    prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { lt: now },
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true },
    }),
    prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { gte: monthStart, lt: now },
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now } } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: true } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, lateArrival: true } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: false } }),
    sudo.query.ClassInstance.findMany({
      where: { ...organizationWhere, date: { gte: now.toISOString() }, isCancelled: { equals: false } },
      take: 12,
      orderBy: [{ date: "asc" }],
      query: "id date maxCapacity classSchedule { id name maxCapacity } instructor { user { name } } bookings { id status }",
    }),
    sudo.query.Member.findMany({
      where: { ...organizationWhere, status: { equals: "active" }, user: { membership: { status: { equals: "active" } } } },
      take: 8,
      orderBy: [{ joinDate: "desc" }],
      query: "id name email attendanceRate lastCheckIn user { membership { id status classCreditsRemaining tier { id name } } }",
    }),
  ]);

  const totalRevenue = (completedPaymentAggregate._sum.amount ?? 0) - (completedPaymentAggregate._sum.refundAmount ?? 0);
  const monthlyRevenue = (monthlyPaymentAggregate._sum.amount ?? 0) - (monthlyPaymentAggregate._sum.refundAmount ?? 0);
  const settledPayments = completedPaymentAggregate._count._all;
  const utilization = (upcomingInstances as any[]).map((instance) => {
    const confirmedBookings = (instance.bookings || []).filter((booking: any) => booking.status === "confirmed").length;
    const waitlistCount = (instance.bookings || []).filter((booking: any) => booking.status === "waitlist").length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    return {
      id: instance.id,
      name: instance.classSchedule?.name ?? "Class",
      instructorName: instance.instructor?.user?.name ?? "Instructor TBD",
      nextSessionDate: instance.date ?? null,
      maxCapacity,
      confirmedBookings,
      waitlistCount,
      utilizationPercent: toPercent(confirmedBookings, maxCapacity),
    };
  });
  const membershipHealth = (activeMembershipMembers as any[]).map((member) => ({
    id: member.id,
    name: member.name ?? "Member",
    email: member.email ?? "—",
    membershipStatus: member.user?.membership?.status ?? "unknown",
    planName: member.user?.membership?.tier?.name ?? "No tier",
    creditsRemaining: member.user?.membership?.classCreditsRemaining ?? null,
    attendanceRate: member.attendanceRate ?? 0,
    lastCheckIn: member.lastCheckIn ?? null,
  }));

  return {
    timeZone,
    operator: {
      activeMembers,
      checkInsToday: todayCheckIns,
      upcomingSessionsToday,
      liveOrStartingSoon,
      waitlistPressure: utilization.reduce((sum, row) => sum + row.waitlistCount, 0),
      pastDueMemberships,
    },
    revenue: {
      monthlyRevenue,
      totalRevenue,
      currencyCode: reportCurrency,
      settledPayments,
      monthlySettledPayments: monthlyPaymentAggregate._count._all,
      averagePayment: settledPayments ? Math.round(totalRevenue / settledPayments) : 0,
    },
    attendance: {
      totalMarked,
      attendedCount,
      lateCount,
      noShowCount,
      attendanceRate: toPercent(attendedCount, totalMarked),
      noShowRate: toPercent(noShowCount, totalMarked),
    },
    utilization,
    membershipHealth,
  };
}
