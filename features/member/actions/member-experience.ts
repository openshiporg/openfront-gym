"use server";

import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export type MemberProfileProjection = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  joinDate: string;
  status: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  healthNotes: { conditions: string[]; injuries: string[]; notes: string } | null;
  profilePhotoUrl: string | null;
  membershipTier: { id: string; name: string; monthlyPrice: number } | null;
  membershipLengthDays: number;
  attendanceRate: number;
  lastCheckIn: string | null;
};

const PROFILE_FIELDS = `
  id name email phone dateOfBirth joinDate status
  emergencyContactName emergencyContactPhone healthNotes profilePhotoUrl
  membershipTier { id name monthlyPrice }
  membershipLengthDays attendanceRate lastCheckIn
`;

export async function getMemberProfileAction(): Promise<MemberProfileProjection> {
  const response = await keystoneClient<{ memberProfile: MemberProfileProjection }>(`
    query MemberProfile {
      memberProfile { ${PROFILE_FIELDS} }
    }
  `);
  if (!response.success) throw new Error(response.error);
  return response.data.memberProfile;
}

export async function updateMemberProfileAction(data: {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  healthNotes?: { conditions: string[]; injuries: string[]; notes: string };
}): Promise<MemberProfileProjection> {
  const response = await keystoneClient<{ updateMemberProfile: MemberProfileProjection }>(`
    mutation UpdateMemberProfile($data: MemberProfileUpdateInput!) {
      updateMemberProfile(data: $data) { ${PROFILE_FIELDS} }
    }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.updateMemberProfile;
}

export async function getMemberCheckInCodeAction(): Promise<{ qrDataUrl: string; expiresIn: number }> {
  const response = await keystoneClient<{ memberCheckInCode: { qrDataUrl: string; expiresIn: number } }>(`
    query MemberCheckInCode {
      memberCheckInCode { qrDataUrl expiresIn }
    }
  `);
  if (!response.success) throw new Error(response.error);
  return response.data.memberCheckInCode;
}
