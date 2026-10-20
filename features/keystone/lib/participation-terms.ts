import { lockParticipationPolicy } from "./operational-policy";

/**
 * Owner-pasted participation terms (Store Settings → Participation terms). Each change is
 * published as a ParticipationPolicy version carrying a snapshot of the text, so acceptance
 * evidence records exactly which wording a member accepted. Booking and admission keep using
 * the existing policy enforcement in operational-policy.ts.
 */
export const PARTICIPATION_TERMS_PATH = "/waiver";
export const PARTICIPATION_TERMS_PLACEHOLDER = "Please replace this with your gym’s terms of service.";

/** The onboarding placeholder is not approved terms; publishing it never asks members to accept. */
export function isParticipationTermsPlaceholder(text: string) {
  const normalize = (value: string) => value.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(text) === normalize(PARTICIPATION_TERMS_PLACEHOLDER);
}

export const PARTICIPATION_TERMS_MAX_LENGTH = 50_000;

/**
 * Publishes pasted terms as a new policy version inside the caller's transaction, after the
 * caller took the policy lock and re-read current state. Age, health-data purpose and
 * retention are inherited from the current policy, never reset by a text change.
 */
export async function publishParticipationTerms(tx: any, organizationId: string, text: string, publishedBy: string) {
  await lockParticipationPolicy(tx, organizationId);
  const body = text.trim();
  const enforce = Boolean(body) && !isParticipationTermsPlaceholder(body);
  const latest = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (latest && latest.documentReference === PARTICIPATION_TERMS_PATH && latest.documentText === body && latest.enforceWaiver === enforce) return latest;
  if (!latest && !body) return null;
  const published = await tx.participationPolicy.count({ where: { organizationId } });
  return tx.participationPolicy.create({
    data: {
      organizationId,
      version: `v${published + 1}`,
      documentReference: PARTICIPATION_TERMS_PATH,
      documentText: body,
      // The gym's own published terms must be accepted. Clearing them, or leaving the
      // onboarding placeholder, publishes a version with nothing to accept.
      enforceWaiver: enforce,
      adultOnly: latest?.adultOnly ?? false,
      healthPurpose: latest?.healthPurpose ?? "",
      retentionDays: latest?.retentionDays ?? 365,
      publishedBy,
    },
  });
}

/** The published pasted terms, or null. `acceptanceRequired` is false for the placeholder. */
export async function currentParticipationTerms(prisma: any, organizationId: string | null) {
  if (!organizationId) return null;
  const latest = await prisma.participationPolicy.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, version: true, documentText: true, enforceWaiver: true },
  });
  // The onboarding placeholder is an instruction to the owner, never customer-facing terms.
  if (!latest?.documentText || isParticipationTermsPlaceholder(latest.documentText)) return null;
  return { policyId: latest.id as string, version: latest.version as string, text: latest.documentText as string, acceptanceRequired: Boolean(latest.enforceWaiver) };
}

/** The current policy as the Store Settings editor shows it (staff only). */
export async function participationPolicyForEditor(prisma: any, organizationId: string) {
  const latest = await prisma.participationPolicy.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, version: true, documentReference: true, documentText: true, enforceWaiver: true, adultOnly: true, healthPurpose: true, retentionDays: true, createdAt: true },
  });
  if (!latest) return null;
  return {
    policyId: latest.id as string,
    version: latest.version as string,
    source: latest.documentReference === PARTICIPATION_TERMS_PATH ? "pasted" : "document",
    documentReference: latest.documentReference as string,
    text: (latest.documentText as string) || "",
    placeholder: isParticipationTermsPlaceholder(String(latest.documentText || "")),
    acceptanceRequired: Boolean(latest.enforceWaiver),
    adultOnly: Boolean(latest.adultOnly),
    healthPurpose: (latest.healthPurpose as string) || "",
    retentionDays: latest.retentionDays as number,
    publishedAt: latest.createdAt instanceof Date ? latest.createdAt.toISOString() : String(latest.createdAt),
  };
}
