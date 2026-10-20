import { select } from "@keystone-6/core/fields";

/**
 * How a row's createdAt/updatedAt were established. Rows that existed before tracking was added
 * to their list are marked "added_by_migration": their tracking times are when tracking began,
 * not when the row was created, and the row's own lifecycle times (startedAt, requestedAt,
 * completedAt) remain the only observed facts about it.
 */
export const trackingBasisField = select({
  type: "string",
  options: [
    { label: "Recorded when the row was created", value: "recorded" },
    { label: "Unknown: the row predates tracking", value: "added_by_migration" },
  ],
  defaultValue: "recorded",
  validation: { isRequired: true },
  access: { read: () => true, create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } },
});
