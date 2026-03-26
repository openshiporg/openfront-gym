"use server";

import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

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

  const document = `
    query FrontDeskData($where: MemberWhereInput) {
      members(where: $where, take: 10, orderBy: [{ joinDate: desc }]) {
        id
        name
        email
        phone
        status
        lastCheckIn
        membershipTier { id name }
        user {
          id
          membership {
            id
            status
            classCreditsRemaining
            tier { id name }
          }
        }
      }
      checkIns(take: 12, orderBy: [{ checkInTime: desc }]) {
        id
        checkInTime
        method
        membershipValidated
        member { id name email }
        location { id name }
      }
      locations(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) {
        id
        name
      }
    }
  `;

  const response = await keystoneClient<{
    members: FrontDeskMember[];
    checkIns: FrontDeskCheckIn[];
    locations: { id: string; name?: string | null }[];
  }>(document, { where });

  if (!response.success) {
    return {
      success: false as const,
      error: response.error,
      members: [],
      checkIns: [],
      locations: [],
    };
  }

  return {
    success: true as const,
    members: response.data.members,
    checkIns: response.data.checkIns,
    locations: response.data.locations,
  };
}

export async function manualCheckIn(formData: FormData): Promise<void> {
  const memberId = formData.get("memberId")?.toString();
  const locationId = formData.get("locationId")?.toString();
  const method = formData.get("method")?.toString() || "manual";

  if (!memberId) {
    throw new Error("Missing member id.");
  }

  const mutation = `
    mutation ManualCheckIn($data: CheckInCreateInput!) {
      createCheckIn(data: $data) {
        id
      }
    }
  `;

  const response = await keystoneClient(mutation, {
    data: {
      member: { connect: { id: memberId } },
      ...(locationId ? { location: { connect: { id: locationId } } } : {}),
      method,
      checkInTime: new Date().toISOString(),
    },
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath("/dashboard/platform/check-in");
}
