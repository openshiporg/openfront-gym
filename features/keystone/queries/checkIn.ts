import { currentCheckInActor } from "../access/currentCheckInActor";
import { assertMembershipServiceEligibility } from "../lib/membership-credits";

/** Tenant-bounded front-desk projection. Member self-service stays on its own list access rules. */
export async function getFrontDeskWorkspace(
  _root: unknown,
  { query }: { query?: string | null },
  context: any,
) {
  const actor = await currentCheckInActor(context);
  const organizationId = actor.organizationId;
  const search = typeof query === "string" ? query.trim() : "";
  if (search.length === 1) throw new Error("Search with at least two characters");
  if (search.length > 100) throw new Error("Member search must be 100 characters or fewer");

  const memberWhere = {
    AND: [
      { organization: { id: { equals: organizationId } } },
      ...(search ? [{ OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ] }] : []),
    ],
  };
  const tenantWhere = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const [members, checkIns, locations, gymSettings] = await Promise.all([
    search ? sudo.query.Member.findMany({
      where: memberWhere,
      take: 10,
      orderBy: [{ joinDate: "desc" }],
      query: `
        id name status
        user { membership { status creditPeriodStart creditPeriodEnd startDate nextBillingDate freezeStartDate freezeEndDate } }
      `,
    }) : Promise.resolve([]),
    sudo.query.CheckIn.findMany({
      where: { AND: [tenantWhere, { checkOutTime: { equals: null } }] },
      take: 12,
      orderBy: [{ checkInTime: "desc" }],
      query: "id checkInTime method membershipValidated member { name } location { id name }",
    }),
    sudo.query.Location.findMany({
      where: { AND: [tenantWhere, { isActive: { equals: true } }] },
      take: 200,
      orderBy: [{ name: "asc" }],
      query: "id name",
    }),
    sudo.query.GymSettings.findMany({
      where: tenantWhere,
      take: 1,
      query: "timezone organization { timezone }",
    }),
  ]);

  const checkedAt = new Date();
  return {
    members: (members as any[]).map((member) => {
      const membership = member.user?.membership;
      let membershipEligible = false;
      let entitlementReason = "No membership found";
      if (member.status !== "active") entitlementReason = `Member account is ${member.status || "unavailable"}`;
      else if (membership) {
        try {
          assertMembershipServiceEligibility(membership, checkedAt);
          membershipEligible = true;
          entitlementReason = "";
        } catch (error) {
          entitlementReason = error instanceof Error ? error.message : "Membership eligibility requires review";
        }
      }
      return {
        id: member.id,
        name: member.name,
        status: member.status,
        membershipEligible,
        entitlementReason,
      };
    }),
    checkIns: (checkIns as any[]).map((checkIn) => ({
      id: checkIn.id,
      checkInTime: new Date(checkIn.checkInTime).toISOString(),
      method: checkIn.method,
      membershipValidated: checkIn.membershipValidated,
      member: checkIn.member ? { name: checkIn.member.name } : null,
      location: checkIn.location ? { id: checkIn.location.id, name: checkIn.location.name } : null,
    })),
    locations,
    gymSettings,
  };
}
