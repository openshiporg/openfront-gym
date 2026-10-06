import { guardKeystonePrismaResults } from "./prisma-result";

/** Called only inside the caller's member-locked transaction. No provider calls. */
export function monthlyServicePeriod(membership: any, at: Date) {
  const start = new Date(membership.creditPeriodStart || membership.startDate);
  const end = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || at < start || at >= end) {
    throw new Error("Service is outside the paid membership period");
  }
  const monthAt = (offset: number) => {
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(start.getUTCMonth() + offset);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return result;
  };
  let offset = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
  if (monthAt(offset) > at) offset -= 1;
  const periodStart = monthAt(offset);
  const next = monthAt(offset + 1);
  const periodEnd = next < end ? next : end;
  return { periodStart, periodEnd };
}

export function assertMembershipServiceEligibility(membership: any, at: Date) {
  if (!membership || membership.status !== "active") throw new Error("Membership is not active");
  monthlyServicePeriod(membership, at);
  if (membership.freezeStartDate && at >= new Date(membership.freezeStartDate) &&
      (!membership.freezeEndDate || at < new Date(membership.freezeEndDate))) {
    throw new Error("Membership is frozen for this service date");
  }
}

export async function assertNoPendingMembershipFreeze(tx: any, organizationId: string, membershipId: string) {
  tx = guardKeystonePrismaResults(tx);
  const attempt = await tx.membershipBillingAttempt.findFirst({
    where: { organizationId, membershipId, operation: "freeze", status: "processing" },
    select: { id: true },
  });
  if (attempt instanceof Error) throw attempt;
  if (attempt) throw new Error("Membership freeze is being finalized; participation is temporarily unavailable");
}

export async function ensureMonthlyCreditGrant(tx: any, membership: any, at: Date) {
  tx = guardKeystonePrismaResults(tx);
  assertMembershipServiceEligibility(membership, at);
  const { periodStart, periodEnd } = monthlyServicePeriod(membership, at);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  const key = `${membership.id}:${periodStart.toISOString()}`;
  const existing = await tx.membershipCreditGrant.findUnique({ where: { key } });
  if (existing) return existing;
  // Preserve the unspent balance of pre-ledger current-period memberships. Never
  // manufacture a refund for a legacy booking whose debit source is unknown.
  const anyGrant = await tx.membershipCreditGrant.findFirst({ where: { membershipId: membership.id } });
  const now = new Date();
  const preserveLegacyBalance = !anyGrant &&
    membership.agreementSnapshot?.creditLedgerPolicy !== "monthly-grant-v1" &&
    periodStart.getTime() === new Date(membership.creditPeriodStart || membership.startDate).getTime() &&
    periodStart <= now && now < periodEnd;
  // New checkout agreements explicitly opt into a spendable paid-period ledger.
  // Only older agreements without that marker preserve the scalar balance as
  // evidence for pre-ledger bookings.
  const remaining = allowance === -1 ? -1 : preserveLegacyBalance
    ? Math.min(Math.max(membership.classCreditsRemaining ?? 0, 0), Math.max(allowance, 0))
    : allowance;
  return tx.membershipCreditGrant.create({ data: {
    key, organizationId: membership.organizationId, membershipId: membership.id,
    periodStart, periodEnd, allowance, remaining,
  } });
}

export async function debitBookingCredit(tx: any, membership: any, bookingId: string, at: Date) {
  tx = guardKeystonePrismaResults(tx);
  const key = `${bookingId}:debit`;
  const existing = await tx.membershipCreditEntry.findUnique({ where: { key } });
  if (existing) return tx.membershipCreditGrant.findUnique({ where: { id: existing.grantId } });
  const grant = await ensureMonthlyCreditGrant(tx, membership, at);
  if (grant.allowance !== -1 && grant.remaining <= 0) throw new Error("No class credits remaining for this service month");
  const amount = grant.allowance === -1 ? 0 : -1;
  const updated = amount ? await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: 1 } } }) : grant;
  await tx.membershipCreditEntry.create({ data: {
    key, organizationId: membership.organizationId, grantId: grant.id, bookingId, delta: amount, kind: "booking",
  } });
  await updateCurrentCreditDisplay(tx, membership.id);
  return updated;
}

export async function restoreBookingCredit(tx: any, bookingId: string) {
  tx = guardKeystonePrismaResults(tx);
  const debit = await tx.membershipCreditEntry.findUnique({ where: { key: `${bookingId}:debit` } });
  if (!debit) {
    await tx.classBooking.update({ where: { id: bookingId }, data: { eligibilityReviewReason: "Legacy booking has no credit provenance; staff must review any credit adjustment" } });
    return false;
  }
  const key = `${bookingId}:restore`;
  if (await tx.membershipCreditEntry.findUnique({ where: { key } })) return false;
  const grant = await tx.membershipCreditGrant.findUnique({ where: { id: debit.grantId } });
  if (!grant) throw new Error("Credit source grant is missing");
  if (debit.delta < 0) await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { remaining: { increment: -debit.delta } } });
  await tx.membershipCreditEntry.create({ data: { key, organizationId: grant.organizationId, grantId: grant.id, bookingId, delta: -debit.delta, kind: "restoration" } });
  await updateCurrentCreditDisplay(tx, grant.membershipId);
  return debit.delta < 0;
}

async function updateCurrentCreditDisplay(tx: any, membershipId: string) {
  tx = guardKeystonePrismaResults(tx);
  const now = new Date();
  const current = await tx.membershipCreditGrant.findFirst({ where: { membershipId, periodStart: { lte: now }, periodEnd: { gt: now } }, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }] });
  if (current) await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: current.remaining } });
}

/** Bounded operator/billing follow-up: preserve bookings and seats, flag review;
 * admission still independently rejects ineligible service. Never auto-resurrect. */
export async function reviewFutureMembershipBookings(tx: any, membership: any) {
  tx = guardKeystonePrismaResults(tx);
  const bookings = await tx.classBooking.findMany({ where: {
    organizationId: membership.organizationId, member: { userId: membership.memberId },
    status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: new Date() } },
  }, include: { classInstance: true, member: { select: { status: true } } }, take: 1000 });
  for (const booking of bookings) {
    let reason = "";
    try {
      if (booking.member?.status !== "active") throw new Error(`Member account is ${booking.member?.status || "unavailable"}`);
      assertMembershipServiceEligibility(membership, booking.classInstance.date);
    }
    catch (error) { reason = error instanceof Error ? error.message : "Eligibility requires review"; }
    await tx.classBooking.update({ where: { id: booking.id }, data: { eligibilityReviewReason: reason } });
  }
  return bookings.length;
}

/** Owner/operator refresh uses the same local facts; never contacts a provider. */
export async function refreshMemberEntitlement(context: any, organizationId: string, userId: string) {
  const session = context.session;
  if (!session?.itemId || session.data?.organization?.id !== organizationId || (session.itemId !== userId && !session.data?.role?.canManageAllRecords)) throw new Error("Membership owner or manager permission required");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const identity = await prisma.membership.findFirst({ where: { organizationId, memberId: userId }, select: { id: true } });
  if (!identity) return { refreshed: false, reason: "No membership" };
  return refreshScopedMembership(context.prisma, organizationId, identity.id);
}

export async function refreshScopedMembership(prisma: any, organizationId: string, membershipId: string) {
  prisma = guardKeystonePrismaResults(prisma);
  // Import lazily to keep pure period arithmetic independent of transport.
  const { lockParticipationPolicy } = await import("./operational-policy");
  const { lockTransactionKey } = await import("../mutations/classCapacity");
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `membership:${membershipId}`);
    let membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    if (!membership) throw new Error("Membership not found");
    const member = await tx.member.findFirst({ where: { organizationId, userId: membership.memberId } });
    if (!member) return { refreshed: false, reason: "Member record missing", membershipId };
    await lockTransactionKey(tx, `member:${member.id}`);
    membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    const now = new Date();
    const paidEnd = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
    if (membership.status === "active" && Number.isFinite(paidEnd.getTime()) && paidEnd <= now) {
      membership = await tx.membership.update({ where: { id: membershipId }, data: { status: "expired" }, include: { tier: true } });
    }
    let refreshed = false, reason = "";
    if (membership.status === "active" && member.status === "active") {
      try { assertMembershipServiceEligibility(membership, now); }
      catch (error) { reason = error instanceof Error ? error.message : "Membership requires review"; }
      if (!reason) {
        const grant = await ensureMonthlyCreditGrant(tx, membership, now);
        await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: grant.remaining } });
        refreshed = true;
      }
    } else reason = `Member ${member.status}; membership ${membership.status}`;
    const reviewed = await reviewFutureMembershipBookings(tx, membership);
    if (member.status !== "active") await tx.classBooking.updateMany({ where: { organizationId, memberId: member.id, status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: now } } }, data: { eligibilityReviewReason: `Member account is ${member.status}` } });
    return { refreshed, reason, membershipId, reviewed, reviewLimitReached: reviewed >= 1000 };
  });
}
