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
