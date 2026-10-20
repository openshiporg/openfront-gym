import crypto from "node:crypto";
import { normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { verifyCurrentPassword } from "../lib/password-proof";
import { mailDeliveryEnabled, sendEmailChangeConfirmation, sendEmailChangedNotice, type MailOutcome } from "../lib/mail";
import { resolvePublicBaseUrl } from "../lib/internal-origin";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_MINUTES = 60;

const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function signedInUser(context: any) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error("Sign in to change your sign-in email");
  return String(userId);
}

/**
 * Only the account holder changes their sign-in email, and only to a mailbox they control:
 * the current password proves the holder, then a link sent to the new address must be opened by
 * that same signed-in holder before the switch (confirmEmailChange). Nothing changes until then.
 */
export async function requestEmailChange(
  _root: unknown,
  { newEmail, currentPassword, surface }: { newEmail: string; currentPassword: string; surface?: string | null },
  context: any,
): Promise<{ pendingEmail: string; mail: MailOutcome | "failed" }> {
  const userId = signedInUser(context);
  const email = normalizeAuthIdentity(newEmail);
  if (!emailPattern.test(email) || email.length > 254 || email.endsWith(".invalid")) throw new Error("Enter a valid email address");
  if (!mailDeliveryEnabled()) throw new Error("Changing your sign-in email needs email, which is turned off right now");
  await verifyCurrentPassword(context, userId, currentPassword);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `identity:${userId}`);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, organizationId: true } });
    if (!user) throw new Error("Account not found");
    if (user.email === email) throw new Error("That's already your sign-in email");
    const [owner, member] = await Promise.all([
      tx.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } }),
      tx.member.findFirst({ where: { email, NOT: { userId } }, select: { id: true } }),
    ]);
    if (owner || member) throw new Error("That email can't be used for this account");
    await tx.user.update({ where: { id: userId }, data: { pendingEmail: email, pendingEmailTokenHash: tokenHash(token), pendingEmailRequestedAt: new Date() } });
  });
  const path = surface === "dashboard" ? "/dashboard/platform/account/confirm-email" : "/account/confirm-email";
  const mail = await sendEmailChangeConfirmation(`${resolvePublicBaseUrl()}${path}?token=${encodeURIComponent(token)}`, email).catch(() => "failed" as const);
  return { pendingEmail: email, mail };
}

/**
 * Switches the sign-in email to the confirmed pending address for the signed-in holder, in one
 * transaction with the linked Member's contact email (collisions are refused before any write).
 */
export async function confirmEmailChange(_root: unknown, { token }: { token: string }, context: any) {
  const userId = signedInUser(context);
  if (typeof token !== "string" || !token || token.length > 200) throw new Error("This confirmation link is not valid");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const changed = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `identity:${userId}`);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, organizationId: true, pendingEmail: true, pendingEmailTokenHash: true, pendingEmailRequestedAt: true } });
    const expected = Buffer.from(String(user?.pendingEmailTokenHash || ""));
    const supplied = Buffer.from(tokenHash(token));
    if (!user?.pendingEmail || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      throw new Error("This confirmation link is not valid for the account you're signed in to");
    }
    if (!user.pendingEmailRequestedAt || Date.now() - new Date(user.pendingEmailRequestedAt).getTime() > CONFIRMATION_MINUTES * 60_000) {
      await tx.user.update({ where: { id: userId }, data: { pendingEmail: null, pendingEmailTokenHash: null, pendingEmailRequestedAt: null } });
      return { expired: true as const };
    }
    const email = user.pendingEmail as string;
    const [owner, member] = await Promise.all([
      tx.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } }),
      tx.member.findFirst({ where: { email, NOT: { userId } }, select: { id: true } }),
    ]);
    if (owner || member) throw new Error("That email is now used by another account; request a change to a different address");
    await tx.user.update({ where: { id: userId }, data: { email, pendingEmail: null, pendingEmailTokenHash: null, pendingEmailRequestedAt: null } });
    await tx.member.updateMany({ where: { userId, organizationId: user.organizationId }, data: { email } });
    return { previous: user.email as string, email };
  });
  if ("expired" in changed) throw new Error("This confirmation link has expired. Request the change again");
  if (mailDeliveryEnabled() && changed.previous) await sendEmailChangedNotice(changed.previous).catch(() => undefined);
  return true;
}
