import crypto from "node:crypto";
import { normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { ensureBoundedMemberRole } from "./memberRole";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteMember(
  _root: unknown,
  { data }: { data: { name: string; email: string; phone?: string | null } },
  context: any,
) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Member management permission required");
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = normalizeAuthIdentity(data.email);
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  if (!name || name.length > 120) throw new Error("Name is required and must be 120 characters or fewer");
  if (!emailPattern.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (phone.length > 40) throw new Error("Phone number is too long");

  return context.transaction(async (transactionContext: any) => {
    await transactionContext.prisma.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`member-invite:${organizationId}`}, 0))) AS acquired
    `;
    const sudo = transactionContext.sudo();
    const existing = await sudo.query.User.findMany({
      where: { email: { equals: email } },
      take: 1,
      query: "id email organization { id }",
    });
    if (existing[0]) {
      if ((existing[0] as any).organization?.id !== organizationId) {
        throw new Error("An account with this email already exists");
      }
      const members = await sudo.query.Member.findMany({
        where: {
          AND: [
            { user: { id: { equals: (existing[0] as any).id } } },
            { organization: { id: { equals: organizationId } } },
          ],
        },
        take: 1,
        query: "id email",
      });
      if (!members[0]) throw new Error("This account exists but is not a member profile");
      return {
        userId: (existing[0] as any).id,
        memberId: (members[0] as any).id,
        email: (existing[0] as any).email,
      };
    }

    const role = await ensureBoundedMemberRole(transactionContext, organizationId);

    const user = await sudo.query.User.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        role: { connect: { id: role.id } },
        name,
        email,
        phone,
        password: crypto.randomBytes(32).toString("base64url"),
      },
      query: "id email",
    });
    const member = await sudo.query.Member.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: user.id } },
        name,
        email,
        phone,
        status: "active",
        joinDate: new Date().toISOString(),
      },
      query: "id",
    });
    return { userId: user.id, memberId: member.id, email };
  });
}
