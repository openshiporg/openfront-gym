export type QualificationSummary = { name: string; status: "listed" | "current" | "expired" | "revoked" | "unverified" };

/**
 * A qualification's name and effective status for display, never its evidence reference or
 * verification details. Plain strings are descriptive listings; structured entries carry status.
 */
export function qualificationSummary(entry: unknown, at = new Date()): QualificationSummary | null {
  if (typeof entry === "string") return entry.trim() ? { name: entry.trim().slice(0, 200), status: "listed" } : null;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const item = entry as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim().slice(0, 200) : "";
  if (!name) return null;
  if (item.revoked === true) return { name, status: "revoked" };
  const expiresAt = item.expiresAt ? new Date(String(item.expiresAt)) : null;
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt <= at) return { name, status: "expired" };
  const verifiedAt = item.verifiedAt ? new Date(String(item.verifiedAt)) : null;
  if (item.required === true && !(verifiedAt && Number.isFinite(verifiedAt.getTime()) && verifiedAt <= at)) return { name, status: "unverified" };
  return { name, status: "current" };
}

/** The qualification names a public coach profile shows: listings and current entries only. */
export function publicQualificationNames(value: unknown, at = new Date()) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => qualificationSummary(entry, at))
    .filter((entry): entry is QualificationSummary => Boolean(entry) && (entry!.status === "listed" || entry!.status === "current"))
    .map((entry) => entry.name)
    .slice(0, 50);
}

// Legacy certification strings remain descriptive. A structured required entry
// makes the studio's chosen prerequisite enforceable without inventing a
// universal certification law or silently treating free text as verification.
export function assertInstructorQualifications(instructor: { certifications?: unknown }, at: Date) {
  const entries = Array.isArray(instructor.certifications) ? instructor.certifications : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || entry.required !== true) continue;
    const expiresAt = new Date(entry.expiresAt);
    const verifiedAt = new Date(entry.verifiedAt);
    if (!entry.name || !entry.evidenceReference || !Number.isFinite(expiresAt.getTime()) || expiresAt <= at || !Number.isFinite(verifiedAt.getTime()) || verifiedAt > at || entry.revoked === true) throw new Error("A required instructor qualification is expired, revoked or unverified");
  }
}
