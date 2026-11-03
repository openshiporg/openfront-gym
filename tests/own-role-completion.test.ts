import test from "node:test";
import assert from "node:assert/strict";
import { ownRoleCompletionError, validateRoleInput } from "../features/keystone/models/Role";
import { Role } from "../features/keystone/models/Role";

const full = { id: "r1", organizationId: "o1", canManageAllRecords: true, canManageRoles: true, canManageCheckIns: false };
const partial = { id: "r2", organizationId: "o1", canManageAllRecords: false, canManageRoles: true, canManageCheckIns: false };

async function validate(item: any, resolvedData: any, sessionRole: any, operation = "update") {
  const errors: string[] = [];
  await validateRoleInput({
    operation,
    item,
    resolvedData,
    session: { itemId: "u1", data: { organization: { id: "o1" }, role: sessionRole } },
    context: { session: null, prisma: {}, sudo: () => ({ query: {} }), query: {} },
    addValidationError: (m: string) => errors.push(m),
  });
  return errors;
}

test("a full-capability holder may add a missing capability to its own role", () => {
  assert.equal(ownRoleCompletionError(full, { canManageCheckIns: true }), null);
  assert.equal(ownRoleCompletionError(full, { canManageCheckIns: true, updatedAt: new Date() }), null);
});

test("Keystone's full-shape resolvedData (untouched fields undefined) is judged by the touched fields only", () => {
  const shape = { name: undefined, organization: undefined, assignedTo: undefined, canManageRoles: undefined, isInstructor: undefined, createdAt: undefined, updatedAt: undefined };
  assert.equal(ownRoleCompletionError(full, { ...shape, canManageCheckIns: true }), null);
  assert.match(String(ownRoleCompletionError(full, { ...shape, canManageRoles: false })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { ...shape, name: "Owner" })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { ...shape, canManageAllRecords: null })), /only gain capabilities/);
});

test("a full-capability holder may not remove a flag, rename, or change relationships of its own role", () => {
  assert.match(String(ownRoleCompletionError(full, { canManageRoles: false })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { name: "Owner" })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { organization: { connect: { id: "o2" } } })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { assignedTo: { connect: [{ id: "u2" }] } })), /only gain capabilities/);
  assert.match(String(ownRoleCompletionError(full, { isInstructor: true })), /only gain capabilities/);
});

test("a non-full role still cannot modify its own role (self-escalation guard kept)", () => {
  assert.match(String(ownRoleCompletionError(partial, { canManageCheckIns: true })), /cannot modify the role assigned to your own account/);
  assert.match(String(ownRoleCompletionError({ ...partial, canManageAllRecords: true, canManageRoles: false }, { canManageCheckIns: true })), /cannot modify/);
});

test("validateRoleInput uses the stored role, not the session snapshot, for own-role completion", async () => {
  assert.deepEqual(await validate(full, { canManageCheckIns: true }, full), []);
  assert.equal((await validate(partial, { canManageCheckIns: true }, { ...partial, canManageAllRecords: true })).length, 1);
  assert.equal((await validate(full, { canManageRoles: false }, full)).length, 1);
});

test("update filter exposes the own role only to a full-capability session; delete never does", () => {
  const f: any = (Role as any).access.filter;
  const s = (role: any) => ({ session: { data: { organization: { id: "o1" }, role } } });
  assert.deepEqual(f.update(s(full)), { organization: { id: { equals: "o1" } } });
  assert.deepEqual(f.update(s(partial)), { AND: [{ organization: { id: { equals: "o1" } } }, { id: { not: { equals: "r2" } } }] });
  assert.deepEqual(f.delete(s(full)), { AND: [{ organization: { id: { equals: "o1" } } }, { id: { not: { equals: "r1" } } }] });
});
