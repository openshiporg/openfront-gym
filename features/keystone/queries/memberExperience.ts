import { generateQRCodeDataURL } from "../../../lib/qrcode";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockParticipationPolicy } from '../lib/operational-policy';
import { disclosedHealthPurpose, effectiveHealthConsentWhere } from '../lib/participation-evidence';
import { memberCheckInUnavailableReason } from "../../member/lib/check-in-eligibility";

const MAX_PROFILE_NAME_LENGTH = 120;
const MAX_PROFILE_PHONE_LENGTH = 40;
const MAX_PROFILE_DATE_LENGTH = 40;
const MAX_HEALTH_NOTE_ITEMS = 20;
const MAX_HEALTH_NOTE_ITEM_LENGTH = 120;
const MAX_HEALTH_NOTES_LENGTH = 2000;

function actor(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  return { userId: session.itemId as string, organizationId: organizationId as string };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHealthNotes(value: unknown) {
  if (value == null) return { conditions: [], injuries: [], notes: "" };
  if (!isJsonObject(value)) throw new Error("Health notes are invalid");
  const validStringArray = (items: unknown) =>
    Array.isArray(items) &&
    items.length <= MAX_HEALTH_NOTE_ITEMS &&
    items.every((item) => typeof item === "string" && item.length <= MAX_HEALTH_NOTE_ITEM_LENGTH);
  if (!validStringArray(value.conditions) || !validStringArray(value.injuries)) {
    throw new Error("Health conditions and injuries are invalid or too long");
  }
  if (typeof value.notes !== "string" || value.notes.length > MAX_HEALTH_NOTES_LENGTH) {
    throw new Error("Health notes are invalid or too long");
  }
  return {
    conditions: (value.conditions as string[]).map((item) => item.trim()).filter(Boolean),
    injuries: (value.injuries as string[]).map((item) => item.trim()).filter(Boolean),
    notes: value.notes.trim(),
  };
}

async function profileForActor(context: any) {
  const { userId, organizationId } = actor(context);
  const members = await context.sudo().query.Member.findMany({
    where: {
      AND: [
        { user: { id: { equals: userId } } },
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: `
      id name email phone dateOfBirth joinDate status updatedAt
      emergencyContactName emergencyContactPhone healthNotes
      profilePhoto { url }
      membershipTier { id name monthlyPrice }
      membershipLengthDays attendanceRate lastCheckIn
      organization { id }
      user { id membership { id status } }
    `,
  });
  const member = members[0] as any;
  if (!member || member.organization?.id !== organizationId || member.user?.id !== userId) {
    throw new Error("Member profile not found");
  }
  return member;
}

function projectProfile(member: any) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    phone: member.phone ?? null,
    dateOfBirth: member.dateOfBirth ?? null,
    joinDate: member.joinDate,
    status: member.status,
    emergencyContactName: member.emergencyContactName ?? null,
    emergencyContactPhone: member.emergencyContactPhone ?? null,
    healthNotes: member.healthNotes ?? { conditions: [], injuries: [], notes: "" },
    profilePhotoUrl: member.profilePhoto?.url ?? null,
    membershipTier: member.membershipTier ?? null,
    membershipLengthDays: member.membershipLengthDays ?? 0,
    attendanceRate: member.attendanceRate ?? 0,
    lastCheckIn: member.lastCheckIn ?? null,
    updatedAt: member.updatedAt ? new Date(member.updatedAt).toISOString() : null,
  };
}

export async function getMemberProfile(_root: unknown, _args: unknown, context: any) {
  return projectProfile(await profileForActor(context));
}

/**
 * Updates only the profile fields actually submitted, under the tenant's participation lock
 * (shared with consent and privacy-clearing commands). Health and emergency-contact fields are
 * sensitive: a save that carries any of them must name the exact profile version it was opened
 * with, so a stale or replayed payload can never restore data that was cleared since. The
 * sign-in email is not changed here; it changes only through requestEmailChange/confirmEmailChange.
 */
export async function updateMemberProfile(
  _root: unknown,
  { data }: { data: Record<string, unknown> },
  context: any,
) {
  const current = await profileForActor(context);
  const { userId, organizationId } = actor(context);
  const has = (key: string) => data[key] !== undefined && data[key] !== null;
  const values: Record<string, any> = {};
  if (has("name")) values.name = String(data.name).trim();
  if (has("phone")) values.phone = String(data.phone).trim();
  if (has("dateOfBirth")) values.dateOfBirth = String(data.dateOfBirth).trim();
  if (has("emergencyContactName")) values.emergencyContactName = String(data.emergencyContactName).trim();
  if (has("emergencyContactPhone")) values.emergencyContactPhone = String(data.emergencyContactPhone).trim();
  if (has("healthNotes")) values.healthNotes = normalizeHealthNotes(data.healthNotes);

  if (values.name !== undefined && (!values.name || values.name.length > MAX_PROFILE_NAME_LENGTH)) throw new Error("Name is required and must be 120 characters or fewer");
  if (values.phone !== undefined && values.phone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Phone number is too long");
  if (values.dateOfBirth !== undefined && values.dateOfBirth.length > MAX_PROFILE_DATE_LENGTH) throw new Error("Date of birth is too long");
  if (values.emergencyContactName !== undefined && values.emergencyContactName.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Emergency contact name is too long");
  if (values.emergencyContactPhone !== undefined && values.emergencyContactPhone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Emergency contact phone is too long");
  if (values.dateOfBirth) {
    const parsed = new Date(values.dateOfBirth);
    if (Number.isNaN(parsed.getTime()) || parsed > new Date()) throw new Error("Date of birth must be a valid past date");
  }
  if (has("email") && String(data.email).trim().toLowerCase() !== String(current.email || "").toLowerCase()) {
    throw new Error("Change your sign-in email with Change email; the new address is confirmed from its own inbox");
  }
  const sensitive = ["healthNotes", "emergencyContactName", "emergencyContactPhone"].some((key) => values[key] !== undefined);
  const expectedVersion = has("expectedUpdatedAt") ? new Date(String(data.expectedUpdatedAt)) : null;
  if (sensitive && (!expectedVersion || !Number.isFinite(expectedVersion.getTime()))) {
    throw new Error("Reload your profile, then make your change again; health and emergency details need the version you opened");
  }

  await context.transaction(async (transactionContext: any) => {
    const prisma = guardKeystonePrismaResults(transactionContext.prisma);
    await lockParticipationPolicy(prisma, organizationId);
    const member = await prisma.member.findFirst({ where: { id: current.id, userId, organizationId }, select: { id: true, updatedAt: true } });
    if (!member) throw new Error("Member profile not found");
    if (expectedVersion && (!Number.isFinite(expectedVersion.getTime()) || expectedVersion.getTime() !== new Date(member.updatedAt).getTime())) {
      throw new Error("Your profile changed since this page was opened. Reload it, then make your change again.");
    }
    const notes = values.healthNotes;
    if (notes && (notes.notes || notes.conditions?.length || notes.injuries?.length)) {
      // The same rule as the consent commands: current policy with a disclosed purpose, and a
      // health permission accepted by now, not withdrawn, not expired.
      const policy = await prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const consent = policy && disclosedHealthPurpose(policy) && await prisma.participationEvidence.findFirst({ where: effectiveHealthConsentWhere(organizationId, member.id, policy.id, new Date()) });
      if (!consent) throw new Error("Review the studio policy and record health-data consent in Participation and privacy before saving optional health information");
    }
    const memberData: Record<string, unknown> = {};
    if (values.name !== undefined) memberData.name = values.name;
    if (values.phone !== undefined) memberData.phone = values.phone || null;
    if (values.dateOfBirth !== undefined) memberData.dateOfBirth = values.dateOfBirth ? new Date(values.dateOfBirth) : null;
    if (values.emergencyContactName !== undefined) memberData.emergencyContactName = values.emergencyContactName;
    if (values.emergencyContactPhone !== undefined) memberData.emergencyContactPhone = values.emergencyContactPhone;
    if (values.healthNotes !== undefined) memberData.healthNotes = values.healthNotes;
    if (Object.keys(memberData).length) await prisma.member.update({ where: { id: member.id }, data: memberData });
    const userData: Record<string, unknown> = {};
    if (values.name !== undefined) userData.name = values.name;
    if (values.phone !== undefined) userData.phone = values.phone || "";
    if (Object.keys(userData).length) {
      await transactionContext.sudo().query.User.updateOne({ where: { id: userId }, data: userData, query: "id" });
    }
  });

  return projectProfile(await profileForActor(context));
}

export async function getMemberCheckInCode(_root: unknown, _args: unknown, context: any) {
  const member = await profileForActor(context);
  const membershipStatus = member.user?.membership?.status;
  const unavailableReason = memberCheckInUnavailableReason(member.status, membershipStatus);
  if (unavailableReason) {
    return { qrDataUrl: null, expiresIn: 0, error: unavailableReason };
  }
  return {
    qrDataUrl: await generateQRCodeDataURL(member.id, member.organization.id),
    expiresIn: 30,
    error: null,
  };
}

const UPCOMING_STATUSES = new Set(["confirmed", "waitlist"]);

/**
 * One page of the signed-in member's own upcoming bookings in session-date order (the order a
 * member needs, which the booking list can't sort by), with the total for paging. Only booking
 * ids come back; the storefront reads the bookings themselves through normal booking access.
 */
export async function getMyUpcomingBookingPage(
  _root: unknown,
  { status, skip = 0, take = 20, before }: { status: string; skip?: number; take?: number; before?: string | null },
  context: any,
) {
  const { userId, organizationId } = actor(context);
  if (!UPCOMING_STATUSES.has(status)) throw new Error("Choose confirmed or waitlist bookings");
  if (!Number.isInteger(skip) || skip < 0 || skip > 100_000 || !Number.isInteger(take) || take < 1 || take > 50) throw new Error("Invalid page");
  const until = before ? new Date(before) : null;
  if (until && !Number.isFinite(until.getTime())) throw new Error("Invalid date");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const where = {
    organizationId, status, member: { userId, organizationId },
    classInstance: { isCancelled: false, date: { gte: new Date(), ...(until ? { lt: until } : {}) } },
  };
  const [total, rows] = await Promise.all([
    prisma.classBooking.count({ where }),
    prisma.classBooking.findMany({ where, orderBy: [{ classInstance: { date: "asc" } }, { id: "asc" }], skip, take, select: { id: true } }),
  ]);
  return { ids: rows.map((row: any) => row.id), total };
}
