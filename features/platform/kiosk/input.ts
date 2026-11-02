/** Kiosk form input checks, shared by the kiosk server actions and their tests. */

export type KioskInputResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function parseKioskCheckIn(input: { memberId?: unknown; qrCode?: unknown; locationId?: unknown }): KioskInputResult<{ memberId: string | null; qrCode: string | null; locationId: string | null }> {
  for (const field of ["memberId", "qrCode", "locationId"] as const) {
    if (input[field] != null && typeof input[field] !== "string") return { ok: false, error: `${field} must be a string` };
  }
  const memberId = text(input.memberId);
  const qrCode = text(input.qrCode);
  const locationId = text(input.locationId);
  if ((!memberId && !qrCode) || memberId.length > 200 || locationId.length > 200 || qrCode.length > 4096) {
    return { ok: false, error: "A valid member ID or QR code is required" };
  }
  return { ok: true, data: { memberId: memberId || null, qrCode: qrCode || null, locationId: locationId || null } };
}

export function parseKioskGuest(input: { name?: unknown; phone?: unknown; hostMember?: unknown; idempotencyKey?: unknown }): KioskInputResult<{ name: string; phone: string | null; hostMember: string | null; idempotencyKey: string }> {
  for (const field of ["name", "phone", "hostMember", "idempotencyKey"] as const) {
    if (input[field] != null && typeof input[field] !== "string") return { ok: false, error: `${field} must be a string` };
  }
  const name = text(input.name);
  const phone = text(input.phone);
  const hostMember = text(input.hostMember);
  const idempotencyKey = text(input.idempotencyKey);
  if (!name || name.length > 120 || phone.length > 40 || hostMember.length > 120 || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    return { ok: false, error: "Guest details are invalid or too long" };
  }
  return { ok: true, data: { name, phone: phone || null, hostMember: hostMember || null, idempotencyKey } };
}

/** null: too short to search (no results, no error). */
export function parseKioskSearch(query: unknown): KioskInputResult<string | null> {
  const value = text(query);
  if (value.length < 2) return { ok: true, data: null };
  if (value.length > 100) return { ok: false, error: "Search query is too long" };
  return { ok: true, data: value };
}

export function parseKioskUnlock(token: unknown): KioskInputResult<string> {
  if (typeof token !== "string" || !token || token.length > 512) return { ok: false, error: "Kiosk credential is invalid" };
  return { ok: true, data: token };
}
