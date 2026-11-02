/**
 * Class credits use -1 as the stored sentinel for "unlimited". Every screen that shows an
 * allowance or a balance formats it here so the sentinel never reaches a person as "-1".
 */
export const UNLIMITED_CLASS_CREDITS = -1;

/** Integer fields whose value is a class-credit allowance or balance. */
export const CLASS_CREDIT_FIELDS: ReadonlySet<string> = new Set([
  "MembershipTier.classCreditsPerMonth",
  "Membership.classCreditsRemaining",
]);

export function isUnlimitedCredits(value: unknown): boolean {
  return value === UNLIMITED_CLASS_CREDITS;
}

export function isClassCreditField(listKey: string | undefined, path: string): boolean {
  return Boolean(listKey) && CLASS_CREDIT_FIELDS.has(`${listKey}.${path}`);
}

/**
 * Plain value: "Unlimited" for the sentinel, otherwise the number. Used in tables and cards.
 */
export function formatCreditValue(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return isUnlimitedCredits(value) ? "Unlimited" : String(value);
}

/** A remaining balance: "Unlimited", "3 left", or "3 of 4 left" when the allowance is known. */
export function formatCreditsLeft(remaining: number | null | undefined, allowance?: number | null): string | null {
  if (isUnlimitedCredits(allowance) || isUnlimitedCredits(remaining)) return "Unlimited";
  if (typeof remaining !== "number") return null;
  return typeof allowance === "number" && allowance > 0 ? `${remaining} of ${allowance} left` : `${remaining} left`;
}

/** A balance with its noun: "Unlimited classes", "1 class credit left", "3 class credits left". */
export function formatClassCreditsLeft(remaining: number | null | undefined): string | null {
  if (isUnlimitedCredits(remaining)) return "Unlimited classes";
  if (typeof remaining !== "number") return null;
  return `${remaining} class ${remaining === 1 ? "credit" : "credits"} left`;
}
