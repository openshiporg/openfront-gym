// Count-filter oracle: needs DATABASE_URL pointing at a migrated scratch database.
// Run: DATABASE_URL=... node --import tsx --test tests/filter-access.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { getContext } from "@keystone-6/core/context";
import * as PrismaModule from "@prisma/client";
import config from "../features/keystone";

const ctx: any = getContext(config as any, PrismaModule as any);
const sudo = ctx.sudo();
const tag = `flt${Date.now().toString(36)}`;
const role = (o: any) => ({ canCreateRecords: false, canManageAllRecords: false, canSeeOtherPeople: false, canEditOtherPeople: false, canManagePeople: false, canManageRoles: false, canAccessDashboard: false, canManageOnboarding: false, canManageSettings: false, isInstructor: false, ...o });
const roles: Record<string, any> = {
  Admin: role({ name: "Admin", canManageAllRecords: true, canAccessDashboard: true }),
  Instructor: role({ name: "Instructor", isInstructor: true, canAccessDashboard: true }),
  FrontDesk: role({ name: "FrontDesk", canManageCheckIns: true, canAccessDashboard: true }),
  Member: role({ name: "Member" }),
};
let orgId = "";
const sessions: Record<string, any> = {};

const SECRET = "zqo";
test.before(async () => {
  const org = await sudo.db.Organization.createOne({ data: { name: `Flt ${tag}`, slug: tag } });
  orgId = org.id;
  const rows: Record<string, any> = {};
  for (const [k, r] of Object.entries(roles)) {
    rows[k] = await sudo.db.Role.createOne({ data: { ...r, name: `${k} ${tag}`, organization: { connect: { id: orgId } } } });
  }
  const mk = async (key: string, name: string) => sudo.db.User.createOne({ data: { name, email: `${key === "Other" ? SECRET : "zqx"}${key}.${tag}@example.com`, password: "correct horse battery 1", organization: { connect: { id: orgId } }, role: { connect: { id: rows[key]?.id ?? rows.Member.id } } } });
  const users: Record<string, any> = {};
  for (const k of Object.keys(roles)) users[k] = await mk(k, `zqx${k.toLowerCase()}`);
  const other = await mk("Other", `${SECRET}other`);
  const member = await sudo.db.Member.createOne({ data: { name: `${SECRET}hidden`, email: `${SECRET}.hidden.${tag}@example.com`, phone: "555-0100", organization: { connect: { id: orgId } }, user: { connect: { id: other.id } } } });
  const tier = await sudo.db.MembershipTier.createOne({ data: { name: `${SECRET}tier`, monthlyPrice: 10, annualPrice: 100, organization: { connect: { id: orgId } } } });
  await sudo.db.GymPayment.createOne({ data: { amount: 4200, organization: { connect: { id: orgId } }, member: { connect: { id: member.id } } } });
  void tier;
  for (const k of Object.keys(roles)) {
    sessions[k] = { itemId: users[k].id, listKey: "User", data: { name: users[k].name, organization: { id: orgId }, role: { id: rows[k].id, ...roles[k] } } };
  }
});

test.after(async () => {
  await sudo.prisma.$disconnect?.();
});

type Probe = [string, (v: string) => string];
const probes: Probe[] = [
  ["usersCount email", (v) => `usersCount(where:{email:{startsWith:"${v}"}})`],
  ["usersCount role.assignedTo", (v) => `usersCount(where:{role:{assignedTo:{some:{email:{startsWith:"${v}"}}}}})`],
  ["usersCount membership", (v) => `usersCount(where:{membership:{some:{member:{email:{startsWith:"${v}"}}}}})`],
  ["usersCount payments", (v) => `usersCount(where:{payments:{some:{member:{email:{startsWith:"${v}"}}}}})`],
  ["rolesCount assignedTo", (v) => `rolesCount(where:{assignedTo:{some:{email:{startsWith:"${v}"}}}})`],
  ["rolesCount assignedTo name", (v) => `rolesCount(where:{assignedTo:{some:{name:{startsWith:"${v}"}}}})`],
  ["membersCount name", (v) => `membersCount(where:{name:{startsWith:"${v}"}})`],
  ["membersCount email", (v) => `membersCount(where:{email:{startsWith:"${v}"}})`],
  ["membersCount user", (v) => `membersCount(where:{user:{email:{startsWith:"${v}"}}})`],
  ["membersCount payments", (v) => `membersCount(where:{payments:{some:{amount:{gt:${v === SECRET ? 0 : 99999999}}}}})`],
  ["classInstancesCount bookings", (v) => `classInstancesCount(where:{bookings:{some:{member:{name:{startsWith:"${v}"}}}}})`],
  ["classInstancesCount bookings user", (v) => `classInstancesCount(where:{bookings:{some:{member:{user:{email:{startsWith:"${v}"}}}}}})`],
  ["classSchedulesCount instances", (v) => `classSchedulesCount(where:{instances:{some:{bookings:{some:{member:{name:{startsWith:"${v}"}}}}}}})`],
  ["classTypesCount schedules", (v) => `classTypesCount(where:{schedules:{some:{instances:{some:{bookings:{some:{member:{name:{startsWith:"${v}"}}}}}}}}})`],
  ["instructorsCount user", (v) => `instructorsCount(where:{user:{email:{startsWith:"${v}"}}})`],
  ["instructorsCount appointments", (v) => `instructorsCount(where:{appointments:{some:{member:{name:{startsWith:"${v}"}}}}})`],
  ["locationsCount appointments", (v) => `locationsCount(where:{trainerAppointments:{some:{member:{name:{startsWith:"${v}"}}}}})`],
  ["membershipTiersCount sessions", (v) => `membershipTiersCount(where:{paymentSessions:{some:{user:{email:{startsWith:"${v}"}}}}})`],
  ["classBookingsCount member", (v) => `classBookingsCount(where:{member:{name:{startsWith:"${v}"}}})`],
  ["gymPaymentsCount member", (v) => `gymPaymentsCount(where:{member:{name:{startsWith:"${v}"}}})`],
  ["paymentSessionsCount user", (v) => `paymentSessionsCount(where:{user:{email:{startsWith:"${v}"}}})`],
  ["paymentProvidersCount payments", (v) => `paymentProvidersCount(where:{payments:{some:{member:{name:{startsWith:"${v}"}}}}})`],
  ["organizationsCount users", (v) => `organizationsCount(where:{users:{some:{email:{startsWith:"${v}"}}}})`],
  ["organizationsCount members", (v) => `organizationsCount(where:{members:{some:{name:{startsWith:"${v}"}}}})`],
  ["organizationsCount payments", (v) => `organizationsCount(where:{gymPayments:{some:{member:{name:{startsWith:"${v}"}}}}})`],
  ["organizationsCount sessions", (v) => `organizationsCount(where:{paymentSessions:{some:{user:{email:{startsWith:"${v}"}}}}})`],
];

async function run(c: any, expr: string) {
  const res = await c.graphql.raw({ query: `{ n: ${expr} }` });
  if (res.errors?.length) return "error";
  return String((res.data as any)?.n);
}

for (const who of ["anonymous", "Member", "Instructor", "FrontDesk"]) {
  test(`${who}: a where-filter returns the same count whether or not the value exists`, async () => {
    const c = who === "anonymous" ? ctx : ctx.withSession(sessions[who]);
    const leaks: string[] = [];
    for (const [label, build] of probes) {
      const hit = await run(c, build(SECRET));
      const miss = await run(c, build("Nope" + tag));
      if (hit !== miss) leaks.push(`${label}: exists=${hit} absent=${miss}`);
    }
    assert.deepEqual(leaks, []);
  });
}

test("Admin keeps its real filters", async () => {
  const c = ctx.withSession(sessions.Admin);
  assert.notEqual(await run(c, `usersCount(where:{email:{startsWith:"${SECRET}"}})`), "0");
  assert.equal(await run(c, `usersCount(where:{email:{startsWith:"Nope${tag}"}})`), "0");
  assert.notEqual(await run(c, `membersCount(where:{user:{email:{startsWith:"${SECRET}"}}})`), "0");
  assert.equal(await run(c, `membersCount(where:{user:{email:{startsWith:"Nope${tag}"}}})`), "0");
});

test("ownership filters the app relies on still work for limited roles", async () => {
  for (const who of ["Member", "Instructor", "FrontDesk"]) {
    const c = ctx.withSession(sessions[who]);
    const id = sessions[who].itemId;
    for (const expr of [
      `classBookingsCount(where:{member:{user:{id:{equals:"${id}"}}}})`,
      `membersCount(where:{user:{id:{equals:"${id}"}}})`,
      `classBookingsCount(where:{classInstance:{id:{equals:"x"}}})`,
      `classInstancesCount(where:{isCancelled:{equals:false}})`,
      `classSchedulesCount(where:{isActive:{equals:true}})`,
    ]) {
      assert.notEqual(await run(c, expr), "error", `${who}: ${expr}`);
    }
  }
});
