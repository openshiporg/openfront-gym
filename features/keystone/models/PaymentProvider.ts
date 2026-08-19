import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { checkbox, json, relationship, text } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const PaymentProvider = list({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, code], map: "PaymentProvider_organization_code_key")\n}'
      );
    },
  },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: permissions.canManageAllRecords,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter },
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "adapterKey", "isInstalled"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.paymentProviders",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({ validation: { isRequired: true } }),
    code: text({
      isIndexed: true,
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-z0-9_-]+$/,
          explanation: "Payment provider code must start with pp_ and use lowercase letters, numbers, hyphens, or underscores.",
        },
      },
    }),
    adapterKey: text({
      validation: { isRequired: true },
      ui: { description: "Registered server-side adapter key, such as stripe or manual." },
    }),
    providerAccountId: text({
      isIndexed: true,
      db: { isNullable: true },
      ui: { description: "Verified provider account identity used to route webhooks to this tenant." },
    }),
    isInstalled: checkbox({ defaultValue: true }),
    credentials: json({
      defaultValue: {},
      access: {
        read: denyAll,
      },
      ui: {
        description: "Write-only provider credentials. Gym's Stripe adapter normally reads secrets from environment variables.",
      },
    }),
    metadata: json({
      defaultValue: {},
      access: { read: permissions.canManageAllRecords },
    }),
    sessions: relationship({
      ref: "PaymentSession.paymentProvider",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    payments: relationship({
      ref: "GymPayment.paymentProvider",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    events: relationship({
      ref: "PaymentEvent.paymentProvider",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    ...trackingFields,
  },
});
