"use server";

import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { resolveGymTimeZone } from "@/lib/timezone";
import { FRONT_DESK_DATA_DOCUMENT } from "../graphql";

export type FrontDeskMember = {
  id: string;
  name: string;
  status?: string | null;
  membershipEligible: boolean;
  entitlementReason: string;
};

export type FrontDeskCheckIn = {
  id: string;
  checkInTime: string;
  method: string;
  membershipValidated: boolean;
  member?: {
    name?: string | null;
  } | null;
  location?: {
    id: string;
    name?: string | null;
  } | null;
};

export async function getFrontDeskData(query?: string) {
  const trimmed = query?.trim() ?? "";

  const response = await keystoneClient<{
    frontDeskWorkspace: {
      members: FrontDeskMember[];
      checkIns: FrontDeskCheckIn[];
      locations: { id: string; name?: string | null }[];
      gymSettings: { timezone?: string | null; organization?: { timezone?: string | null } | null }[];
    };
  }>(FRONT_DESK_DATA_DOCUMENT, { query: trimmed });

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
    members: response.data.frontDeskWorkspace.members,
    checkIns: response.data.frontDeskWorkspace.checkIns,
    locations: response.data.frontDeskWorkspace.locations,
    timeZone: resolveGymTimeZone(
      response.data.frontDeskWorkspace.gymSettings[0]?.timezone,
      response.data.frontDeskWorkspace.gymSettings[0]?.organization?.timezone,
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
