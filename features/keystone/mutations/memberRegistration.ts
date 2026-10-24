import { GraphQLError } from "graphql";
import { budgetKey, consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { isKnownSource, requestClientSource } from "../../../lib/clientSource";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { ensureBoundedMemberRole } from "./memberRole";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The storefront maps sign-up failures on `extensions.code`, so they read the same in production. */
function signupError(code: string, message: string) {
  return new GraphQLError(message, { extensions: { code } });
}

export async function registerMember(
  _root: unknown,
  args: { data: { email: string; password: string; name: string; phone?: string | null } },
  context: any,
) {
  if (process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED !== "true") {
    throw signupError("SIGNUP_UNAVAILABLE", "Public signup is not enabled");
  }

  const input = args.data;
  const email = normalizeAuthIdentity(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!emailPattern.test(email) || email.length > 254) throw signupError("INVALID_EMAIL", "Enter a valid email address");
  if (name.length < 1 || name.length > 120) throw signupError("INVALID_NAME", "Name must be between 1 and 120 characters");
  if (password.length < 12 || password.length > 128) throw signupError("INVALID_PASSWORD", "Password must be between 12 and 128 characters");
  if (phone.length > 40) throw signupError("INVALID_PHONE", "Phone number is too long");
  if (
    (isKnownSource(requestClientSource(context.req)) && !(await consumeAuthAttempt(context.prisma, budgetKey("signup-source", requestClientSource(context.req)), 20, 60 * 60 * 1000))) ||
    !(await consumeAuthAttempt(context.prisma, budgetKey("signup", email, requestClientSource(context.req)), 5, 60 * 60 * 1000))
  ) {
    throw signupError("RATE_LIMITED", "Too many signup attempts. Try again later");
  }

  const organizationId = process.env.PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID?.trim();
  if (!organizationId) throw signupError("SIGNUP_UNAVAILABLE", "Public signup is not available");
  const storefrontOrganizationId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  if (!storefrontOrganizationId || storefrontOrganizationId !== organizationId) {
    throw signupError("SIGNUP_UNAVAILABLE", "Public signup is not available");
  }

  return context.transaction(async (transactionContext: any) => {
    const prisma = guardKeystonePrismaResults(transactionContext.prisma);
    const sudo = transactionContext.sudo();
    await prisma.$queryRaw`
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
    if (!organizations[0]) throw signupError("SIGNUP_UNAVAILABLE", "Public signup is not available");

    const existing = await sudo.query.User.findMany({
      where: { email: { equals: email } },
      take: 1,
      query: "id",
    });
    if (existing[0]) throw signupError("ACCOUNT_EXISTS", "An account with that email already exists");

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
