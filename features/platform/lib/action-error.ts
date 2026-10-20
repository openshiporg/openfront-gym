/**
 * Staff-facing text for a failed Keystone request. Platform server actions return this
 * instead of throwing: production builds replace a thrown Server Action message with a
 * generic render error. Business validation messages pass through; internal, database
 * and transport errors fall back to `fallback`.
 */
export function staffActionError(
  response: { error?: string; errors?: Array<{ message?: string } | null> | null },
  fallback: string,
) {
  const raw = (response.errors?.find((entry) => entry?.message)?.message || response.error || "")
    .split("\n")[0]
    .replace(/\s*\((?:Original Error|Path|Code|Validation):[\s\S]*$/, "")
    .trim();
  const internal = /prisma|invalid `|unique constraint|\bP\d{4}\b|ECONN|fetch failed|timed? ?out|cannot read|is not a function|undefined|unexpected|internal server|graphql/i;
  if (!raw || raw.length > 240 || internal.test(raw)) return fallback;
  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}
