import { consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { ensureBoundedMemberRole } from "./memberRole";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerMember(
  _root: unknown,
  args: { data: { email: string; password: string; name: string; phone?: string | null } },
  context: any,
) {
  if (process.env.PUBLIC_SIGNUPS_ALLOWED !== "true") {
    throw new Error("Public signup is not enabled");
  }

  const input = args.data;
  const email = normalizeAuthIdentity(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!emailPattern.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (name.length < 1 || name.length > 120) throw new Error("Name must be between 1 and 120 characters");
  if (password.length < 12 || password.length > 128) throw new Error("Password must be between 12 and 128 characters");
  if (phone.length > 40) throw new Error("Phone number is too long");
  if (
    !(await consumeAuthAttempt(context.prisma, "signup:global", 100, 60 * 60 * 1000)) ||
    !(await consumeAuthAttempt(context.prisma, `signup:${email}`, 5, 60 * 60 * 1000))
  ) {
    throw new Error("Too many signup attempts. Try again later");
  }

  const organizationId =
    process.env.PUBLIC_SIGNUP_ORGANIZATION_ID?.trim() ||
    process.env.SIGNUP_ORGANIZATION_ID?.trim();
  if (!organizationId) throw new Error("Public signup is not configured for an organization");
  const storefrontOrganizationId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  if (!storefrontOrganizationId || storefrontOrganizationId !== organizationId) {
    throw new Error("Public signup organization must match the configured storefront organization");
  }

  return context.transaction(async (transactionContext: any) => {
    const sudo = transactionContext.sudo();
    await transactionContext.prisma.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`public-signup:${organizationId}`}, 0))) AS acquired
    `;

    const organizations = await sudo.query.Organization.findMany({
      where: {
        AND: [
          { id: { equals: organizationId } },
          { status: { equals: "active" } },
        ],
      },
      take: 1,
      query: "id",
    });
    if (!organizations[0]) throw new Error("Public signup organization is not available");

    const existing = await sudo.query.User.findMany({
      where: { email: { equals: email } },
      take: 1,
      query: "id",
    });
    if (existing[0]) throw new Error("An account with that email already exists");

    const role = await ensureBoundedMemberRole(transactionContext, organizationId);

    const user = await sudo.query.User.createOne({
      data: {
        name,
        email,
        password,
        phone,
        organization: { connect: { id: organizationId } },
        role: { connect: { id: role.id } },
      },
      query: "id email name",
    });
    await sudo.query.Member.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: user.id } },
        name,
        email,
        phone,
        status: "active",
      },
      query: "id",
    });
    return user;
  });
}
