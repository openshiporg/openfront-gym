import { isParticipationTermsPlaceholder } from "./participation-terms";

/**
 * Two kinds of evidence are kept apart. "acceptance" is the member accepting (or staff verifying)
 * the participation terms. "health_consent" is only the optional permission to store health
 * information for the policy's stated purpose; it never counts as accepting the terms.
 */
export const ACCEPTANCE_EVIDENCE = "acceptance";
export const HEALTH_CONSENT_EVIDENCE = "health_consent";

/**
 * The one validity rule for a single evidence row, shared by admission, the booking sheet and the
 * member's account: for this policy, accepted at or before now, not withdrawn, not expired.
 */
export function isEffectiveEvidence(entry: { policyId?: string | null; revokedAt?: unknown; acceptedAt?: unknown; expiresAt?: unknown } | null | undefined, policyId: string, now = Date.now()) {
  if (!entry || entry.policyId !== policyId || entry.revokedAt || !entry.acceptedAt) return false;
  if (new Date(entry.acceptedAt as string).getTime() > now) return false;
  return !entry.expiresAt || new Date(entry.expiresAt as string).getTime() > now;
}

/** Database form of the same rule over every row, never a display page. */
function effectiveWhere(at: Date) {
  return { revokedAt: null, acceptedAt: { lte: at }, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] };
}

/** Current legal acceptance of the policy: acceptance rows only (a health grant is not one). */
export function effectiveAcceptanceWhere(organizationId: string, memberId: string, policyId: string, at: Date) {
  return { organizationId, memberId, policyId, kind: ACCEPTANCE_EVIDENCE, ...effectiveWhere(at) };
}

/** Current permission to store health information under the policy (either kind of row). */
export function effectiveHealthConsentWhere(organizationId: string, memberId: string, policyId: string, at: Date) {
  return { organizationId, memberId, policyId, healthConsent: true, ...effectiveWhere(at) };
}

/**
 * The health-information purpose a member can actually consent to: set on the current policy and
 * not part of the onboarding placeholder (which is an instruction to the owner, not published terms).
 */
export function disclosedHealthPurpose(policy: { healthPurpose?: string | null; documentText?: string | null } | null | undefined) {
  const purpose = String(policy?.healthPurpose || "").trim();
  if (!purpose || isParticipationTermsPlaceholder(String(policy?.documentText || ""))) return null;
  return purpose;
}

export function evidenceState(entry: { revokedAt?: unknown; acceptedAt?: unknown; expiresAt?: unknown }, now = Date.now()) {
  if (entry.revokedAt) return "withdrawn" as const;
  if (entry.expiresAt && new Date(entry.expiresAt as string).getTime() <= now) return "expired" as const;
  if (entry.acceptedAt && new Date(entry.acceptedAt as string).getTime() > now) return "pending" as const;
  return "current" as const;
}
