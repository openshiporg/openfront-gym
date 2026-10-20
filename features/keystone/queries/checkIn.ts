import { currentCheckInActor } from "../access/currentCheckInActor";
import { assertMembershipServiceEligibility } from "../lib/membership-credits";

/** Tenant-bounded front-desk projection. Member self-service stays on its own list access rules. */
const OPEN_VISIT_PAGE = 25;

export async function getFrontDeskWorkspace(
  _root: unknown,
  { query, visitQuery, visitLocationId, visitOrder, visitSkip }: { query?: string | null; visitQuery?: string | null; visitLocationId?: string | null; visitOrder?: string | null; visitSkip?: number | null },
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
  // Every open visit is reachable: searchable by member, filterable by location, paged, oldest first on request.
  const visitSearch = typeof visitQuery === "string" ? visitQuery.trim().slice(0, 100) : "";
  const visitSite = typeof visitLocationId === "string" && visitLocationId ? visitLocationId : null;
  const requestedSkip = Number.isSafeInteger(visitSkip) ? Math.min(Math.max(0, visitSkip as number), 1_000_000) : 0;
  const openWhere = { AND: [
    tenantWhere,
    { checkOutTime: { equals: null } },
    ...(visitSearch ? [{ member: { name: { contains: visitSearch, mode: "insensitive" } } }] : []),
    ...(visitSite ? [{ location: { id: { equals: visitSite } } }] : []),
  ] };
  const sudo = context.sudo();
  // Count first, so an offset past the end shows the last page instead of a false "nobody".
  const openVisitTotal = await sudo.query.CheckIn.count({ where: openWhere });
  const skip = openVisitTotal > 0 ? Math.min(requestedSkip, Math.floor((openVisitTotal - 1) / OPEN_VISIT_PAGE) * OPEN_VISIT_PAGE) : 0;
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
      where: openWhere,
      skip,
      take: OPEN_VISIT_PAGE,
      orderBy: [{ checkInTime: visitOrder === "oldest" ? "asc" : "desc" }, { id: "asc" }],
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
    openVisits: { total: openVisitTotal, skip, pageSize: OPEN_VISIT_PAGE },
    locations,
    gymSettings,
  };
}
