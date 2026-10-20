import { guardKeystonePrismaResults, requirePrismaAffectedCount } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";
import { lockCurrentActor } from "../lib/current-actor";

const allowed: Record<string, Set<string>> = {
  not_started: new Set(["in_progress", "dismissed"]),
  in_progress: new Set(["in_progress", "dismissed"]),
  dismissed: new Set(["in_progress", "dismissed"]),
  completed: new Set(["completed"]),
};

export async function transitionOnboardingStatus(
  _root: unknown,
  { status }: { status: string },
  context: any,
) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManageOnboarding) {
    throw new Error("Onboarding management permission required");
  }
  if (status === "completed") throw new Error("Completed is reserved for deterministic onboarding completion");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  // The stored status (not the request's session snapshot) decides, under the same per-tenant
  // lock setup completion uses, and the write only applies if nothing changed meanwhile.
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `onboarding:${organizationId}`);
    // The role as it stands after the wait, not the session snapshot.
    await lockCurrentActor(tx, String(session.itemId), String(organizationId), ["canManageOnboarding"], { requireActiveOrganization: false });
    const user = await tx.user.findFirst({ where: { id: session.itemId, organizationId }, select: { onboardingStatus: true } });
    const current = user?.onboardingStatus ?? "not_started";
    if (!allowed[current]?.has(status)) {
      throw new Error(`Onboarding transition ${current} -> ${status} is not allowed`);
    }
    const updated = await tx.user.updateMany({
      where: { id: session.itemId, organizationId, onboardingStatus: current },
      data: { onboardingStatus: status },
    });
    requirePrismaAffectedCount(updated, 1, "onboarding status transition");
    return { id: session.itemId, onboardingStatus: status };
  });
}
