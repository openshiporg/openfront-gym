import { throwOnKeystonePrismaError } from "./prisma-result";
import { effectiveAcceptanceWhere } from "./participation-evidence";

export async function lockParticipationPolicy(tx: any, organizationId: string) {
  const result = await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`participation:${organizationId}`}))`;
  throwOnKeystonePrismaError(result, "participation advisory lock");
}

export function isAdult(birthDate: Date | string | null, at: Date) {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  if (!Number.isFinite(birth.getTime()) || birth > at) return false;
  let years = at.getUTCFullYear() - birth.getUTCFullYear();
  if (at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate())) years--;
  return years >= 18;
}

/** Admits participation under the current policy and returns the policy and acceptance relied on. */
export async function assertParticipationAllowed(tx: any, organizationId: string, memberId: string | null, at: Date, locationId?: string | null): Promise<{ policyId: string | null; evidenceId: string | null }> {
  await lockParticipationPolicy(tx, organizationId);
  const closure = await tx.operationsCase.findFirst({ where: {
    organizationId, kind: 'closure', status: { not: 'resolved' },
    // Without a site, fail closed when any site in this organization is closed.
    ...(locationId ? { OR: [{ locationId: '' }, { locationId }] } : {}),
  } });
  if (closure) throw new Error('Participation is unavailable during an active facility closure');
  const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!policy) return { policyId: null, evidenceId: null }; // Explicit external-process setup remains visible in the operations workspace.
  if (!memberId) {
    if (policy.enforceWaiver || policy.adultOnly) throw new Error('Registered participant verification is required by studio policy');
    return { policyId: policy.id, evidenceId: null };
  }
  const member = await tx.member.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new Error('Member not found');
  if (policy.adultOnly && !isAdult(member.dateOfBirth, at)) throw new Error('Adult age verification is required before participation');
  if (!policy.enforceWaiver) return { policyId: policy.id, evidenceId: null };
  // Only an acceptance of the current terms admits; an optional health grant never does.
  const evidence = await tx.participationEvidence.findFirst({ where: effectiveAcceptanceWhere(organizationId, memberId, policy.id, at) });
  if (!evidence) throw new Error('Current waiver verification is required before participation');
  return { policyId: policy.id, evidenceId: evidence.id };
}
