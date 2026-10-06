import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { text, relationship, timestamp, integer } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";

export const MembershipCreditEntry = list({
  access: { operation: { query: permissions.canManageAllRecords, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: tenantFilter } },
  fields: {
    organization: relationship({ ref: "Organization" }),
    key: text({ isIndexed: "unique", validation: { isRequired: true } }),
    grant: relationship({ ref: "MembershipCreditGrant" }),
    booking: relationship({ ref: "ClassBooking" }),
    delta: integer({ validation: { isRequired: true } }),
    kind: text({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
