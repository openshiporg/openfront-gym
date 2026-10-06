import { currentRoleActor } from '../access/currentRoleActor';
import { lockTransactionKey } from './classCapacity';
import { enqueueOperationalNotice } from '../lib/operational-notices';
import { guardKeystonePrismaResults } from '../lib/prisma-result';

export async function setMemberAccountStatus(
  _root: unknown,
  { memberId, status }: { memberId: string; status: string },
  context: any,
) {
  const actor = await currentRoleActor(context);
  const organizationId = actor.organizationId;
  if (!actor.canManagePeople) throw new Error("Member management permission required");
  if (status !== "active" && status !== "suspended" && status !== "cancelled") {
    throw new Error("Member account status must be active, suspended, or cancelled");
  }

  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `member:${memberId}`);
    await transaction.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`member-account:${memberId}`}, 0))) AS acquired
    `;
    const member = await transaction.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, status: true, userId: true },
    });
    if (!member) throw new Error("Member was not found in this organization");
    if (member.status === "cancelled") {
      throw new Error("A cancelled member account cannot be reactivated from this workflow");
    }
    if (member.status === status) return member;
    if (status === "cancelled") {
      const [bookings, payments, checkIns, subscriptions, memberships, paymentSessions] = await Promise.all([
        transaction.classBooking.count({ where: { memberId: member.id, organizationId } }),
        transaction.gymPayment.count({ where: { memberId: member.id, organizationId } }),
        transaction.checkIn.count({ where: { memberId: member.id, organizationId } }),
        transaction.subscription.count({ where: { memberId: member.id, organizationId } }),
        transaction.membership.count({
          where: {
            memberId: member.userId,
            organizationId,
            status: { in: ["active", "frozen", "past-due"] },
          },
        }),
        transaction.paymentSession.count({
          where: { userId: member.userId, organizationId },
        }),
      ]);
      if (bookings || payments || checkIns || subscriptions || memberships || paymentSessions) {
        throw new Error("Only an incomplete member with no operational or billing history can be closed");
      }
    }
    const updated = await transaction.member.update({ where: { id: member.id }, data: { status } });
    await transaction.classBooking.updateMany({ where: {
      organizationId, memberId, status: { in: ['confirmed', 'waitlist'] }, classInstance: { date: { gt: new Date() } },
      ...(status === 'active' ? { eligibilityReviewReason: 'Member account is suspended' } : {}),
    }, data: { eligibilityReviewReason: status === 'active' ? '' : 'Member account is suspended' } });
    await enqueueOperationalNotice(transaction, { organizationId, memberId, key: `member-status:${memberId}:${updated.updatedAt.toISOString()}`, kind: 'membership', message: `Your member account is now ${status}. Existing reservations remain visible for staff review; participation requires current eligibility.` });
    return updated;
  });
}
