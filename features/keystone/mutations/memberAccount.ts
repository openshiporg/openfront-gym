export async function setMemberAccountStatus(
  _root: unknown,
  { memberId, status }: { memberId: string; status: string },
  context: any,
) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Member management permission required");
  }
  if (status !== "active" && status !== "suspended" && status !== "cancelled") {
    throw new Error("Member account status must be active, suspended, or cancelled");
  }

  return context.prisma.$transaction(async (transaction: any) => {
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
    return transaction.member.update({ where: { id: member.id }, data: { status } });
  });
}
