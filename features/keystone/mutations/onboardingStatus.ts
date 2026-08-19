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
  if (!allowed[session.data.onboardingStatus]?.has(status)) {
    throw new Error(`Onboarding transition ${session.data.onboardingStatus} -> ${status} is not allowed`);
  }
  const updated = await context.prisma.user.updateMany({
    where: { id: session.itemId, organizationId },
    data: { onboardingStatus: status },
  });
  if (updated.count !== 1) throw new Error("Onboarding actor was not found in the session organization");
  return { id: session.itemId, onboardingStatus: status };
}
