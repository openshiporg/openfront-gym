"use server";

import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { resolveGymTimeZone } from "@/lib/timezone";
import { FRONT_DESK_DATA_DOCUMENT } from "../graphql";

export type FrontDeskMember = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status?: string | null;
  lastCheckIn?: string | null;
  membershipTier?: { id: string; name?: string | null } | null;
  user?: {
    id: string;
    membership?: {
      id: string;
      status: string;
      classCreditsRemaining?: number | null;
      tier?: { id: string; name?: string | null } | null;
    } | null;
  } | null;
};

export type FrontDeskCheckIn = {
  id: string;
  checkInTime: string;
  checkOutTime?: string | null;
  method: string;
  membershipValidated: boolean;
  member?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  location?: {
    id: string;
    name?: string | null;
  } | null;
};

export async function getFrontDeskData(query?: string) {
  const trimmed = query?.trim() ?? "";

  const where = trimmed
    ? {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { email: { contains: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed, mode: "insensitive" } },
        ],
      }
    : undefined;

  const response = await keystoneClient<{
    members: FrontDeskMember[];
    checkIns: FrontDeskCheckIn[];
    locations: { id: string; name?: string | null }[];
    gymSettings: { timezone?: string | null; organization?: { timezone?: string | null } | null }[];
  }>(FRONT_DESK_DATA_DOCUMENT, { where });

  if (!response.success) {
    return {
      success: false as const,
      error: response.error,
      members: [],
      checkIns: [],
      locations: [],
      timeZone: "UTC",
    };
  }

  return {
    success: true as const,
    members: response.data.members,
    checkIns: response.data.checkIns,
    locations: response.data.locations,
    timeZone: resolveGymTimeZone(
      response.data.gymSettings[0]?.timezone,
      response.data.gymSettings[0]?.organization?.timezone,
    ),
  };
}

export async function manualCheckOut(formData: FormData): Promise<void> {
  const checkInId = formData.get("checkInId")?.toString();
  if (!checkInId) throw new Error("Missing check-in id.");

  const response = await keystoneClient(`
    mutation ManualCheckOut($checkInId: ID!) {
      checkOutMember(checkInId: $checkInId) {
        checkIn { id checkOutTime }
        reused
      }
    }
  `, { checkInId });
  if (!response.success) throw new Error(response.error);
  revalidatePath("/dashboard/platform/check-in");
}

export async function manualCheckIn(formData: FormData): Promise<void> {
  const memberId = formData.get("memberId")?.toString();
  const locationId = formData.get("locationId")?.toString();
  const method = formData.get("method")?.toString() || "manual";

  if (!memberId) {
    throw new Error("Missing member id.");
  }

  const mutation = `
    mutation ManualCheckIn($memberId: ID!, $locationId: ID, $method: String!) {
      recordMemberCheckIn(memberId: $memberId, locationId: $locationId, method: $method) {
        checkIn { id }
        reused
      }
    }
  `;

  const response = await keystoneClient(mutation, {
    memberId,
    locationId: locationId || null,
    method,
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath("/dashboard/platform/check-in");
}
