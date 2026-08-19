import { generateQRCodeDataURL } from "../../../lib/qrcode";

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
      id name email phone dateOfBirth joinDate status
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
  };
}

export async function getMemberProfile(_root: unknown, _args: unknown, context: any) {
  return projectProfile(await profileForActor(context));
}

export async function updateMemberProfile(
  _root: unknown,
  { data }: { data: Record<string, unknown> },
  context: any,
) {
  const current = await profileForActor(context);
  const { userId, organizationId } = actor(context);
  const name = data.name === undefined ? current.name : String(data.name).trim();
  const email = data.email === undefined ? current.email : String(data.email).trim().toLowerCase();
  const password = data.password === undefined ? "" : String(data.password);
  const phone = data.phone === undefined ? current.phone ?? "" : String(data.phone).trim();
  const dateOfBirth = data.dateOfBirth === undefined ? current.dateOfBirth : String(data.dateOfBirth).trim();
  const emergencyContactName = data.emergencyContactName === undefined
    ? current.emergencyContactName ?? ""
    : String(data.emergencyContactName).trim();
  const emergencyContactPhone = data.emergencyContactPhone === undefined
    ? current.emergencyContactPhone ?? ""
    : String(data.emergencyContactPhone).trim();
  const healthNotes = data.healthNotes === undefined ? current.healthNotes : normalizeHealthNotes(data.healthNotes);

  if (!name || name.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Name is required and must be 120 characters or fewer");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (password && (password.length < 12 || password.length > 128)) throw new Error("Password must be between 12 and 128 characters");
  if (phone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Phone number is too long");
  if (String(dateOfBirth ?? "").length > MAX_PROFILE_DATE_LENGTH) throw new Error("Date of birth is too long");
  if (emergencyContactName.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Emergency contact name is too long");
  if (emergencyContactPhone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Emergency contact phone is too long");
  if (dateOfBirth) {
    const parsed = new Date(String(dateOfBirth));
    if (Number.isNaN(parsed.getTime()) || parsed > new Date()) throw new Error("Date of birth must be a valid past date");
  }

  await context.transaction(async (transactionContext: any) => {
    const member = await transactionContext.prisma.member.findFirst({
      where: { id: current.id, userId, organizationId },
      select: { id: true },
    });
    if (!member) throw new Error("Member profile not found");
    await transactionContext.prisma.member.update({
      where: { id: member.id },
      data: {
        name,
        email,
        phone: phone || null,
        dateOfBirth: dateOfBirth ? new Date(String(dateOfBirth)) : null,
        emergencyContactName,
        emergencyContactPhone,
        healthNotes,
      },
    });
    await transactionContext.sudo().query.User.updateOne({
      where: { id: userId },
      data: { name, email, phone: phone || "", ...(password ? { password } : {}) },
      query: "id",
    });
  });

  return projectProfile(await profileForActor(context));
}

export async function getMemberCheckInCode(_root: unknown, _args: unknown, context: any) {
  const member = await profileForActor(context);
  const membershipStatus = member.user?.membership?.status;
  if (member.status !== "active" || membershipStatus !== "active") {
    throw new Error(`Membership is ${membershipStatus || member.status || "inactive"}`);
  }
  return {
    qrDataUrl: await generateQRCodeDataURL(member.id, member.organization.id),
    expiresIn: 30,
  };
}
