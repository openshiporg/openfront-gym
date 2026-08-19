import { NextRequest } from 'next/server';

const MAX_DISCOVERY_ID_LENGTH = 200;
const MAX_DISCOVERY_EMAIL_LENGTH = 320;

export type DiscoveryJsonObject = Record<string, unknown>;

export type DiscoveryBookingRequest = {
  classInstanceId: string;
  memberId?: string | null;
  memberEmail?: string | null;
};

export type DiscoveryBookingRequestResult =
  | { ok: true; data: DiscoveryBookingRequest }
  | { ok: false; error: string };

export function isDiscoveryJsonObject(value: unknown): value is DiscoveryJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readDiscoveryJsonObject(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return isDiscoveryJsonObject(body) ? body : null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : null;
}

export function parseDiscoveryBookingRequest(body: DiscoveryJsonObject): DiscoveryBookingRequestResult {
  if (typeof body.classInstanceId !== 'string') {
    return { ok: false, error: 'classInstanceId must be a string.' };
  }

  if (body.memberId != null && typeof body.memberId !== 'string') {
    return { ok: false, error: 'memberId must be a string.' };
  }

  if (body.memberEmail != null && typeof body.memberEmail !== 'string') {
    return { ok: false, error: 'memberEmail must be a string.' };
  }

  const classInstanceId = body.classInstanceId.trim();
  const memberId = normalizeOptionalString(body.memberId);
  const memberEmail = normalizeOptionalString(body.memberEmail);

  if (!classInstanceId) {
    return { ok: false, error: 'classInstanceId is required.' };
  }

  if (classInstanceId.length > MAX_DISCOVERY_ID_LENGTH || (memberId?.length ?? 0) > MAX_DISCOVERY_ID_LENGTH) {
    return { ok: false, error: 'Discovery booking identifier is too long.' };
  }

  if ((memberEmail?.length ?? 0) > MAX_DISCOVERY_EMAIL_LENGTH) {
    return { ok: false, error: 'memberEmail is too long.' };
  }

  if (!memberId && !memberEmail) {
    return { ok: false, error: 'memberId or memberEmail is required.' };
  }

  return {
    ok: true,
    data: {
      classInstanceId,
      memberId,
      memberEmail,
    },
  };
}
