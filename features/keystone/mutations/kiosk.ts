import { getKioskOrganizationId, isKioskTokenValid } from "../../platform/kiosk/auth";
import { validateQRCode } from "../../../lib/qrcode";
import { consumeAuthAttempt } from "../../../lib/authRateLimit";
import {
  recordCapacityControlledMemberCheckIn,
  recordControlledGuestCheckIn,
} from "./gymLifecycle";

function kioskTenant(credential: string, organizationId: string) {
  if (!isKioskTokenValid(credential)) throw new Error("Kiosk operation authorization failed");
  const configuredOrganizationId = getKioskOrganizationId();
  if (!configuredOrganizationId || configuredOrganizationId !== organizationId) {
    throw new Error("Kiosk organization is not configured");
  }
  return configuredOrganizationId;
}

export async function authorizeKioskSession(
  _root: unknown,
  { credential, organizationId }: { credential: string; organizationId: string },
  context: any,
) {
  if (!(await consumeAuthAttempt(context.prisma, "kiosk-session:global", 30, 15 * 60 * 1000))) {
    throw new Error("Too many kiosk unlock attempts");
  }
  kioskTenant(credential, organizationId);
  return true;
}

export async function kioskSearchMembers(
  _root: unknown,
  { query, organizationId, credential }: { query: string; organizationId: string; credential: string },
  context: any,
) {
  const tenantId = kioskTenant(credential, organizationId);
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 100) throw new Error("Kiosk search must be between 2 and 100 characters");
  const members = await context.sudo().query.Member.findMany({
    where: {
      AND: [
        { organization: { id: { equals: tenantId } } },
        { OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { email: { contains: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed, mode: "insensitive" } },
        ] },
      ],
    },
    take: 10,
    orderBy: [{ joinDate: "desc" }],
    query: `
      id name email phone status membershipTier { id name }
      user { id membership { id status classCreditsRemaining tier { id name } } }
    `,
  });
  return (members as any[]).map((member) => ({
    id: member.id,
    name: member.name || "Unknown",
    email: member.email || "",
    phone: member.phone || "",
    status: member.status,
    membershipTier: member.membershipTier?.name || member.user?.membership?.tier?.name || null,
    membershipStatus: member.user?.membership?.status || null,
    classCreditsRemaining: member.user?.membership?.classCreditsRemaining ?? null,
  }));
}

export async function kioskRecordMemberCheckIn(
  _root: unknown,
  args: { memberId?: string | null; qrCode?: string | null; locationId?: string | null; organizationId: string; credential: string },
  context: any,
) {
  const tenantId = kioskTenant(args.credential, args.organizationId);
  const memberId = args.memberId?.trim() || "";
  const qrCode = args.qrCode?.trim() || "";
  const locationId = args.locationId?.trim() || "";
  if ((!memberId && !qrCode) || memberId.length > 200 || locationId.length > 200 || qrCode.length > 4096) {
    return { success: false, error: "A valid member or QR identifier is required" };
  }
  let resolvedMemberId = memberId;
  if (qrCode) {
    const validation = validateQRCode(qrCode);
    if (!validation.valid || !validation.memberId || validation.organizationId !== tenantId) {
      return { success: false, error: validation.error || "Invalid or expired QR code" };
    }
    resolvedMemberId = validation.memberId;
  }

  const members = await context.sudo().query.Member.findMany({
    where: { AND: [{ id: { equals: resolvedMemberId } }, { organization: { id: { equals: tenantId } } }] },
    take: 1,
    query: `
      id name status organization { id } membershipTier { name }
      user { name membership { status classCreditsRemaining tier { name } } }
      subscriptions(where: { status: { equals: "active" } }) { id }
    `,
  });
  const member = members[0] as any;
  if (!member || member.organization?.id !== tenantId) {
    return { success: false, error: "Member not found. Please use member search or visit the front desk." };
  }
  if (member.status !== "active") {
    return { success: false, error: `Member account is ${member.status}. Please visit the front desk.` };
  }
  const membership = member.user?.membership;
  const validAccess = membership ? membership.status === "active" : Boolean(member.subscriptions?.length);
  if (!validAccess) {
    return { success: false, error: "No active membership. Please see the front desk." };
  }

  try {
    const result = await recordCapacityControlledMemberCheckIn(context.prisma, {
      memberId: resolvedMemberId,
      locationId: locationId || null,
      method: qrCode ? "qr_code" : "manual",
      actor: { userId: "kiosk", organizationId: tenantId, canManageAllRecords: false, trustedKiosk: true },
    });
    return {
      success: true,
      error: null,
      checkInId: result.checkIn.id,
      memberName: member.name || member.user?.name || "Member",
      membershipTier: member.membershipTier?.name || membership?.tier?.name || null,
      checkInTime: new Date(result.checkIn.checkInTime).toISOString(),
      reused: result.reused,
      classCreditsRemaining: membership?.classCreditsRemaining ?? null,
    };
  } catch {
    return { success: false, error: "Check-in could not be recorded. Please review access and location at the front desk." };
  }
}

export async function kioskRecordGuestCheckIn(
  _root: unknown,
  args: { name: string; phone?: string | null; hostMember?: string | null; idempotencyKey: string; organizationId: string; credential: string },
  context: any,
) {
  const tenantId = kioskTenant(args.credential, args.organizationId);
  const name = args.name.trim();
  const phone = args.phone?.trim() || "";
  const hostQuery = args.hostMember?.trim() || "";
  const idempotencyKey = args.idempotencyKey.trim();
  if (!name || name.length > 120 || phone.length > 40 || hostQuery.length > 120 || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("Guest check-in details are invalid or too long");
  }
  let hostMemberId: string | null = null;
  if (hostQuery) {
    const members = await context.sudo().query.Member.findMany({
      where: {
        AND: [
          { organization: { id: { equals: tenantId } } },
          { OR: [
            { user: { name: { contains: hostQuery, mode: "insensitive" } } },
            { user: { email: { contains: hostQuery, mode: "insensitive" } } },
          ] },
        ],
      },
      take: 1,
      query: "id",
    });
    hostMemberId = (members[0] as any)?.id || null;
  }
  const checkIn = await recordControlledGuestCheckIn(context.prisma, {
    guestName: name,
    phone: phone || null,
    organizationId: tenantId,
    hostMemberId,
    idempotencyKey,
  });
  return {
    success: true,
    checkInId: checkIn.id,
    guestName: checkIn.guestName,
    checkInTime: new Date(checkIn.checkInTime).toISOString(),
  };
}
