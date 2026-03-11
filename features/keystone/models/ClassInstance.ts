import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  relationship,
  timestamp,
  integer,
  checkbox,
  text,
} from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const ClassInstance = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["classSchedule", "date", "instructor", "isCancelled"],
    },
  },
  fields: {
    // Reference to the recurring schedule
    classSchedule: relationship({
      ref: "ClassSchedule.instances",
      ui: {
        displayMode: "select",
      },
    }),

    // Specific date for this instance
    date: timestamp({
      validation: { isRequired: true },
      ui: {
        description: "Specific date and time of this class occurrence",
      },
    }),

    // Override instructor for this specific instance (if different from schedule)
    instructor: relationship({
      ref: "Instructor.classInstances",
      ui: {
        displayMode: "select",
        description: "Override instructor (leave empty to use schedule default)",
      },
    }),

    // Override capacity for this specific instance
    maxCapacity: integer({
      ui: {
        description: "Override max capacity (leave empty to use schedule default)",
      },
    }),

    isCancelled: checkbox({
      defaultValue: false,
      ui: {
        description: "Whether this class instance has been cancelled",
      },
    }),

    cancellationReason: text({
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation (if cancelled)",
      },
    }),

    // Bookings for this specific instance
    bookings: relationship({
      ref: "ClassBooking.classInstance",
      many: true,
    }),

    ...trackingFields,
  },
});
