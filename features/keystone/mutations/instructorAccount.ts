import { normalizeAuthIdentity } from "../../../lib/authRateLimit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Replaces an onboarding placeholder address with the real coach address.
 * The feature action sends Keystone's password-reset email only after this
 * tenant-scoped state transition succeeds.
 */
export async function prepareInstructorAccount(
  _root: unknown,
  { instructorId, email }: { instructorId: string; email: string },
  context: any,
) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Instructor account management permission required");
  }
  const normalizedEmail = normalizeAuthIdentity(email);
  if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254 || normalizedEmail.endsWith("@example.invalid")) {
    throw new Error("Enter the coach's real email address");
  }

  const instructors = await context.sudo().query.Instructor.findMany({
    where: {
      AND: [
        { id: { equals: instructorId } },
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: "id user { id organization { id } }",
  });
  const instructor = instructors[0] as any;
  if (!instructor?.user?.id || instructor.user.organization?.id !== organizationId) {
    throw new Error("Instructor account was not found in this organization");
  }

  const updated = await context.query.User.updateOne({
    where: { id: instructor.user.id },
    data: { email: normalizedEmail },
    query: "id email",
  });
  if (!updated?.id) throw new Error("Instructor account could not be updated");
  return { userId: updated.id, email: normalizedEmail };
}
