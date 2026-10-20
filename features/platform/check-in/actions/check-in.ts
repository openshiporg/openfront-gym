"use server";

import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { resolveGymTimeZone } from "@/lib/timezone";
import { FRONT_DESK_DATA_DOCUMENT } from "../graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

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

export type OpenVisitQuery = { visitQuery?: string; visitLocationId?: string; visitOrder?: "newest" | "oldest"; visitSkip?: number };

export async function getFrontDeskData(query?: string, visits: OpenVisitQuery = {}) {
  const trimmed = query?.trim() ?? "";

  const response = await keystoneClient<{
    frontDeskWorkspace: {
      members: FrontDeskMember[];
      checkIns: FrontDeskCheckIn[];
      locations: { id: string; name?: string | null }[];
      gymSettings: { timezone?: string | null; organization?: { timezone?: string | null } | null }[];
      openVisits: { total: number; skip: number; pageSize: number };
    };
  }>(FRONT_DESK_DATA_DOCUMENT, { query: trimmed, visitQuery: visits.visitQuery || null, visitLocationId: visits.visitLocationId || null, visitOrder: visits.visitOrder || null, visitSkip: visits.visitSkip || 0 });

  if (!response.success) {
    return {
      success: false as const,
      error: staffActionError(response, "Front-desk data could not be loaded. Refresh to try again."),
      members: [],
      checkIns: [],
      openVisits: { total: 0, skip: 0, pageSize: 25 },
      locations: [],
      timeZone: "UTC",
    };
  }

  return {
    success: true as const,
    members: response.data.frontDeskWorkspace.members,
    checkIns: response.data.frontDeskWorkspace.checkIns,
    openVisits: response.data.frontDeskWorkspace.openVisits,
    locations: response.data.frontDeskWorkspace.locations,
    timeZone: resolveGymTimeZone(
      response.data.frontDeskWorkspace.gymSettings[0]?.timezone,
      response.data.frontDeskWorkspace.gymSettings[0]?.organization?.timezone,
    ),
  };
}

export type FrontDeskActionState = { status: "idle" | "done" | "error"; message: string | null };

export async function manualCheckOut(_previous: FrontDeskActionState, formData: FormData): Promise<FrontDeskActionState> {
  const checkInId = formData.get("checkInId")?.toString();
  if (!checkInId) return { status: "error", message: "Choose a visit to check out." };

  const response = await keystoneClient(`
    mutation ManualCheckOut($checkInId: ID!) {
      checkOutMember(checkInId: $checkInId) {
        checkIn { id checkOutTime }
        reused
      }
    }
  `, { checkInId });
  if (!response.success) return { status: "error", message: staffActionError(response, "Check-out was not recorded. Refresh and try again.") };
  revalidatePath("/dashboard/platform/check-in");
  return { status: "done", message: "Checked out." };
}

export async function manualCheckIn(_previous: FrontDeskActionState, formData: FormData): Promise<FrontDeskActionState> {
  const memberId = formData.get("memberId")?.toString();
  const locationId = formData.get("locationId")?.toString();
  const method = formData.get("method")?.toString() || "manual";

  if (!memberId) return { status: "error", message: "Choose a member to check in." };

  const mutation = `
    mutation ManualCheckIn($memberId: ID!, $locationId: ID, $method: String!) {
      recordMemberCheckIn(memberId: $memberId, locationId: $locationId, method: $method) {
        checkIn { id }
        reused
      }
    }
  `;

  const response = await keystoneClient<{ recordMemberCheckIn: { reused?: boolean } }>(mutation, {
    memberId,
    locationId: locationId || null,
    method,
  });

  if (!response.success) {
    return { status: "error", message: staffActionError(response, "Entry was not recorded. Check the member's eligibility and the facility hours in Store Settings, then try again.") };
  }

  revalidatePath("/dashboard/platform/check-in");
  return { status: "done", message: response.data.recordMemberCheckIn?.reused ? "Already checked in." : "Checked in." };
}
