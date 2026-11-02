"use server";

import { cookies, headers } from "next/headers";
import {
  createKioskSessionValue,
  isKioskConfigured,
  isKioskSessionValueValid,
  isKioskTokenValid,
  kioskSessionCookieOptions,
  KIOSK_SESSION_COOKIE,
} from "../../kiosk/auth";
import { authorizeKioskCredentialGraphQL, executeKioskGraphQL } from "./graphql";
import { parseKioskCheckIn, parseKioskGuest, parseKioskSearch, parseKioskUnlock } from "./input";

/**
 * Kiosk server actions. Each one checks the kiosk session, then calls the Keystone kiosk
 * query or mutation with the deployment's kiosk credential. Nothing here is a REST route.
 */

export type KioskAuthorization = "authorized" | "required" | "unconfigured";

export async function kioskAuthorization(): Promise<KioskAuthorization> {
  if (!isKioskConfigured()) return "unconfigured";
  const supplied = (await headers()).get("x-kiosk-token");
  if (isKioskTokenValid(supplied)) return "authorized";
  return isKioskSessionValueValid((await cookies()).get(KIOSK_SESSION_COOKIE)?.value) ? "authorized" : "required";
}

type Locked = { unauthorized: true };
const LOCKED: Locked = { unauthorized: true };

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export async function unlockKiosk(token: string): Promise<{ authorized: boolean; error?: string }> {
  if (!isKioskConfigured()) return { authorized: false, error: "Kiosk is not set up" };
  const parsed = parseKioskUnlock(token);
  if (!parsed.ok) return { authorized: false, error: parsed.error };
  try {
    await authorizeKioskCredentialGraphQL(parsed.data);
  } catch (error) {
    return { authorized: false, error: message(error, "Kiosk credential is invalid") };
  }
  (await cookies()).set(KIOSK_SESSION_COOKIE, createKioskSessionValue(), kioskSessionCookieOptions());
  return { authorized: true };
}

export type KioskMember = {
  id: string; name: string; email: string; phone?: string; status: string;
  membershipTier?: string | null; membershipStatus?: string | null; classCreditsRemaining?: number | null;
};

export async function searchKioskMembers(query: string): Promise<Locked | { members: KioskMember[]; error?: string }> {
  if ((await kioskAuthorization()) !== "authorized") return LOCKED;
  const parsed = parseKioskSearch(query);
  if (!parsed.ok) return { members: [], error: parsed.error };
  if (!parsed.data) return { members: [] };
  try {
    const data = await executeKioskGraphQL<{ kioskSearchMembers: KioskMember[] }>(`
      query KioskSearch($query: String!, $organizationId: ID!, $credential: String!) {
        kioskSearchMembers(query: $query, organizationId: $organizationId, credential: $credential) {
          id name email phone status membershipTier membershipStatus classCreditsRemaining
        }
      }
    `, { query: parsed.data });
    return { members: data.kioskSearchMembers };
  } catch (error) {
    return { members: [], error: message(error, "Search failed") };
  }
}

export type KioskCheckInResult = {
  success: boolean; error?: string | null; checkInId?: string | null; memberName?: string | null;
  membershipTier?: string | null; checkInTime?: string | null; reused?: boolean | null; classCreditsRemaining?: number | null;
};

export async function checkInAtKiosk(input: { memberId?: string; qrCode?: string; locationId?: string }): Promise<Locked | KioskCheckInResult> {
  if ((await kioskAuthorization()) !== "authorized") return LOCKED;
  const parsed = parseKioskCheckIn(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  try {
    const data = await executeKioskGraphQL<{ kioskRecordMemberCheckIn: KioskCheckInResult }>(`
      mutation KioskCheckIn($memberId: String, $qrCode: String, $locationId: String, $organizationId: ID!, $credential: String!) {
        kioskRecordMemberCheckIn(memberId: $memberId, qrCode: $qrCode, locationId: $locationId, organizationId: $organizationId, credential: $credential) {
          success error checkInId memberName membershipTier checkInTime reused classCreditsRemaining
        }
      }
    `, parsed.data);
    return data.kioskRecordMemberCheckIn;
  } catch (error) {
    return { success: false, error: message(error, "Check-in failed") };
  }
}

export type KioskGuestResult = { success: boolean; error?: string | null; checkInId?: string | null; guestName?: string | null; checkInTime?: string | null };

export async function checkInGuestAtKiosk(input: { name?: string; phone?: string; hostMember?: string; idempotencyKey?: string }): Promise<Locked | KioskGuestResult> {
  if ((await kioskAuthorization()) !== "authorized") return LOCKED;
  const parsed = parseKioskGuest(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  try {
    const data = await executeKioskGraphQL<{ kioskRecordGuestCheckIn: KioskGuestResult }>(`
      mutation KioskGuestCheckIn($name: String!, $phone: String, $hostMember: String, $idempotencyKey: String!, $organizationId: ID!, $credential: String!) {
        kioskRecordGuestCheckIn(name: $name, phone: $phone, hostMember: $hostMember, idempotencyKey: $idempotencyKey, organizationId: $organizationId, credential: $credential) {
          success checkInId guestName checkInTime
        }
      }
    `, parsed.data);
    return data.kioskRecordGuestCheckIn;
  } catch (error) {
    return { success: false, error: message(error, "Guest check-in failed") };
  }
}
