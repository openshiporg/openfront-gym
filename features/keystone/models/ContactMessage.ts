import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { relationship, select, text } from "@keystone-6/core/fields";
import { canManageTenant, tenantFilter, tenantItemAccess } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb } from "./tenantRelationships";

const canManageMessages = (args: any) => canManageTenant(args, "canManageCommunications" as any);
const readOnly = { create: denyAll, update: denyAll };

// Storefront contact form inbox. Created only by the public submitContactForm mutation; staff
// with communications access read it and track follow-up status in the dashboard.
export const ContactMessage = list({
  access: {
    operation: { query: canManageMessages, create: denyAll, update: canManageMessages, delete: canManageMessages },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter },
    item: { update: (args: any) => tenantItemAccess(args), delete: (args: any) => tenantItemAccess(args) },
  },
  ui: {
    labelField: "subject",
    listView: {
      initialColumns: ["subject", "email", "topic", "status", "createdAt"],
      initialSort: { field: "createdAt", direction: "DESC" },
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization",
      access: readOnly,
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    subject: text({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    reference: text({ access: readOnly, isIndexed: true, ui: { itemView: { fieldMode: "read" } } }),
    name: text({ access: readOnly, validation: { isRequired: true }, ui: { itemView: { fieldMode: "read" } } }),
    email: text({ access: readOnly, validation: { isRequired: true }, ui: { description: "Reply from the club's own email to this address, then set Status to Replied. Gym does not send replies.", itemView: { fieldMode: "read" } } }),
    phone: text({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    topic: text({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    message: text({ access: readOnly, validation: { isRequired: true }, ui: { displayMode: "textarea", itemView: { fieldMode: "read" } } }),
    sourcePath: text({ access: readOnly, ui: { description: "Storefront page the message was sent from", itemView: { fieldMode: "read" } } }),
    status: select({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In progress", value: "in_progress" },
        { label: "Replied", value: "replied" },
        { label: "Closed", value: "closed" },
      ],
      defaultValue: "new",
      validation: { isRequired: true },
      ui: { displayMode: "segmented-control", description: "Replied: staff answered by email, phone or in person. Staff can't reset passwords; point sign-in requests to Forgot password on the storefront." },
    }),
    staffNotes: text({ ui: { displayMode: "textarea", description: "Internal notes; never shown to the sender" } }),
    ...trackingFields,
  },
});
