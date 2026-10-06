import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { text, relationship, timestamp, integer } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";

export const MembershipCreditGrant = list({
  access: { operation: { query: permissions.canManageAllRecords, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: tenantFilter } },
  fields: {
    organization: relationship({ ref: "Organization" }),
    key: text({ isIndexed: "unique", validation: { isRequired: true } }),
    membership: relationship({ ref: "Membership" }),
    periodStart: timestamp({ validation: { isRequired: true } }),
    periodEnd: timestamp({ validation: { isRequired: true } }),
    allowance: integer({ validation: { isRequired: true } }),
    remaining: integer({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
