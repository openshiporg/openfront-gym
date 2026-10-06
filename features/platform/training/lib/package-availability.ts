export type TrainingPackageStatusView = {
  status: string;
  creditsRemaining: number;
  expiresAt: string | Date | null;
};

function expirationTime(value: TrainingPackageStatusView["expiresAt"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return Number.NaN;
  return Date.parse(value);
}

export function isTrainingPackageSelectable(pack: TrainingPackageStatusView, now = Date.now()): boolean {
  const expiresAt = expirationTime(pack.expiresAt);
  return Number.isFinite(now) && pack.status === "active" && Number.isFinite(pack.creditsRemaining) &&
    pack.creditsRemaining > 0 && Number.isFinite(expiresAt) && expiresAt > now;
}

export function trainingPackageDisplayStatus(pack: TrainingPackageStatusView, now = Date.now()): string {
  if (pack.status !== "active") return pack.status;
  if (!Number.isFinite(now)) return "availability unavailable";
  const expiresAt = expirationTime(pack.expiresAt);
  if (!Number.isFinite(expiresAt)) return "expiry unavailable";
  return expiresAt <= now ? "expired" : "active";
}
