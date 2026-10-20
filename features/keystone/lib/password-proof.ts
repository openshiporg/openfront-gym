import { budgetKey, consumeAuthAttempt } from "../../../lib/authRateLimit";

/**
 * Proves the signed-in account holder knows its current password (E-commerce's
 * updateActiveUserPassword check), with a per-account budget against guessing.
 */
export async function verifyCurrentPassword(context: any, userId: string, password: unknown) {
  if (typeof password !== "string" || !password) throw new Error("Enter your current password");
  if (!(await consumeAuthAttempt(context.prisma, budgetKey("password-proof", userId), 10, 15 * 60 * 1000))) {
    throw new Error("Too many password attempts. Wait 15 minutes and try again");
  }
  const user = await context.sudo().query.User.findOne({ where: { id: userId }, query: "id email" });
  if (!user?.email) throw new Error("Account not found");
  const result = await context.sudo().graphql.raw({
    query: `mutation VerifyCurrentPassword($email: String!, $password: String!) {
      authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess { item { id } }
        ... on UserAuthenticationWithPasswordFailure { message }
      }
    }`,
    variables: { email: user.email, password },
  });
  if (result.errors?.length || (result.data as any)?.authenticateUserWithPassword?.item?.id !== userId) {
    throw new Error("Your current password is incorrect");
  }
}

/** Own-account password change: current password, confirmation, bytes kept exactly as typed. */
export async function changeMemberPassword(
  _root: unknown,
  { currentPassword, newPassword, confirmPassword }: { currentPassword: string; newPassword: string; confirmPassword: string },
  context: any,
) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error("Authentication required");
  if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) throw new Error("Use a new password of 12 to 128 characters");
  if (newPassword !== confirmPassword) throw new Error("The new passwords don't match");
  await verifyCurrentPassword(context, userId, currentPassword);
  await context.sudo().db.User.updateOne({ where: { id: userId }, data: { password: newPassword } });
  return true;
}
