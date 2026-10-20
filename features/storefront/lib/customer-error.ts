/**
 * Customer-facing text for a failed storefront request. Only the server's own GraphQL
 * error message is read — never `ClientError.message`, which embeds the request document
 * and its variables (passwords included) — and internal, database or transport failures
 * fall back to `fallback`. Messages this code throws itself pass through.
 */
export function customerErrorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { errors?: Array<{ message?: string } | null> }; request?: unknown; message?: unknown } | null;
  let raw = "";
  if (candidate?.response) raw = candidate.response.errors?.find((entry) => entry?.message)?.message || "";
  else if (error instanceof Error && !candidate?.request) raw = error.message;
  raw = raw.split("\n")[0].replace(/\s*\((?:Original Error|Path|Code|Validation):[\s\S]*$/, "").trim();
  const internal = /prisma|invalid `|unique constraint|\bP\d{4}\b|ECONN|fetch failed|timed? ?out|cannot read|is not a function|undefined|unexpected|internal server|graphql|mutation |query |variables|password|token/i;
  if (!raw || raw.length > 240 || internal.test(raw)) return fallback;
  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}
