/**
 * Where-filters and orderBy are an oracle: a role that cannot read a value can still count rows
 * with `{ field: { startsWith: "a" } }`, directly or through a relation. Keystone checks only
 * `isFilterable` / `isOrderable`, which default to open, so derive them from the read rules:
 *
 *  - a field is filterable/orderable only where the session may read it (judged against another
 *    person's row in the same organization, so own-row-only rules do not open the whole column);
 *  - a relation also needs the related list to be readable with no narrower row filter than the
 *    organization (otherwise the filter would reach rows the role cannot read);
 *  - tokens, hashes, secrets, credentials and raw provider data are never filterable.
 */
import { tenantFilter, getTenantId } from "../access/tenantPolicy";

const NEVER = /(token|secret|hash|credential|password|digest)/i;
/** Lists every signed-in or public visitor reads in part (active classes, coaches, tiers, places). */
const CATALOG = new Set(["ClassSchedule", "ClassInstance", "ClassType", "Instructor", "Location", "MembershipTier", "GymResource", "Exercise"]);
/** Lists of people: where a partial read must never turn into a value oracle. */
const PEOPLE = new Set(["Member", "User"]);
const NEVER_DATA = new Set(["data", "providerData", "manifest"]);

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function evaluate(rule: any, args: any): Promise<boolean> {
  if (rule === undefined || rule === null) return true;
  if (typeof rule === "boolean") return rule;
  if (typeof rule !== "function") return false;
  try {
    return Boolean(await rule(args));
  } catch {
    return false;
  }
}

function readRule(access: any) {
  if (typeof access === "function") return access;
  if (access && typeof access === "object") return access.read;
  return undefined;
}

type Scope = "none" | "row" | "tenant";

/**
 * How much of a list the session reads: nothing, only some rows (a narrower row filter than the
 * organization), or every row of its organization. Keystone applies a list's row filter to that
 * list's own queries but not to a where-filter that reaches the list through a relation.
 */
async function listScope(models: Record<string, any>, listKey: string, session: any, context: any): Promise<Scope> {
  if (listKey === "Organization") return session ? "tenant" : "none";
  const list = models[listKey];
  if (!list) return "none";
  const args = { session, context, listKey, operation: "query" };
  const access = list.access;
  const operation = typeof access === "function" ? access : access?.operation?.query;
  if (!(await evaluate(operation, args))) return "none";
  const filter = access && typeof access === "object" ? access.filter?.query : undefined;
  if (filter === undefined) return "tenant";
  const resolved = typeof filter === "function" ? await filter(args) : filter;
  if (resolved === false) return "none";
  if (resolved === true) return "tenant";
  return sameJson(resolved, tenantFilter({ session })) ? "tenant" : "row";
}

export function withReadScopedFilters(models: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(models).map(([listKey, config]) => {
    const fields = Object.fromEntries(Object.entries(config.fields ?? {}).map(([fieldKey, field]) => {
      if (typeof field !== "function") return [fieldKey, field];
      const wrapped = (meta: any) => {
        const resolved = (field as any)(meta);
        const read = readRule(resolved.access);
        const never = NEVER.test(fieldKey) || NEVER_DATA.has(fieldKey);
        const relatedList = resolved.dbField?.kind === "relation" ? String(resolved.dbField.list) : null;
        const relatedMany = resolved.dbField?.kind === "relation" && resolved.dbField.mode === "many";
        const allowed = never
          ? async () => false
          : async ({ session, context }: any) => {
              const own = await listScope(models, listKey, session, context);
              if (own === "none") return false;
              if (fieldKey === "id") return true;
              if (read !== undefined) {
                const tenant = getTenantId(session);
                const other = { id: "__other__", userId: "__other__", organizationId: tenant, organization: { id: tenant } };
                if (!(await evaluate(read, { session, context, listKey, fieldKey, item: other, operation: "read" }))) return false;
              }
              if (relatedList) {
                const target = await listScope(models, relatedList, session, context);
                if (target === "none") return false;
                if (target === "tenant") return true;
                // A list read only in part: a many-side relation or a catalog list reaching into people
                // would count rows the role cannot read. A single forward link from its own rows stays.
                return !relatedMany && !(CATALOG.has(listKey) && !CATALOG.has(relatedList));
              }
              // People lists read in part (own account, own roster): a value probe on a scalar would be
              // reached through bookings and payments. Only id and relations filter there.
              return !(PEOPLE.has(listKey) && own === "row");
            };
        return {
          ...resolved,
          isFilterable: resolved.isFilterable ?? allowed,
          isOrderable: resolved.isOrderable ?? allowed,
        };
      };
      return [fieldKey, wrapped];
    }));
    return [listKey, { ...config, fields }];
  }));
}
