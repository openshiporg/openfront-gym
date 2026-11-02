import { formatCreditValue } from "./class-credits";

/**
 * Readable list-column values for gym fields whose stored shape is not human text. They are
 * Keystone virtual fields on the lists, so the shared dashboard stays identical to E-commerce.
 */
export function creditsLabel(value: unknown): string | null {
  return typeof value === "number" ? formatCreditValue(value) : null;
}

export function specialtiesLabel(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const names = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return names.length ? names.join(", ") : null;
}
