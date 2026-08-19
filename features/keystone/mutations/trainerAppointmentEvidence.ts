import { createHash } from "node:crypto";

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function hashTrainerAppointmentRequest(request: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(request)))
    .digest("hex");
}

export function assertTrainerAppointmentReplayMatches(existing: { requestHash?: string | null }, request: unknown) {
  if (existing.requestHash !== hashTrainerAppointmentRequest(request)) {
    throw new Error("Appointment idempotency key was already used with different details");
  }
}
