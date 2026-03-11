import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  integer,
  select,
  multiselect,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const ClassType = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "difficulty", "duration", "caloriesBurn"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Yoga, Spin, HIIT, Boxing",
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    difficulty: select({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "All Levels", value: "all-levels" },
      ],
      defaultValue: "all-levels",
      validation: { isRequired: true },
    }),

    duration: integer({
      validation: { isRequired: true },
      defaultValue: 60,
      ui: {
        description: "Typical duration in minutes",
      },
    }),

    equipmentNeeded: multiselect({
      type: "string",
      options: [
        { label: "Mat", value: "mat" },
        { label: "Weights", value: "weights" },
        { label: "Resistance Bands", value: "resistance_bands" },
        { label: "Jump Rope", value: "jump_rope" },
        { label: "Boxing Gloves", value: "boxing_gloves" },
        { label: "Cycling Shoes", value: "cycling_shoes" },
        { label: "Kettlebells", value: "kettlebells" },
        { label: "Medicine Ball", value: "medicine_ball" },
        { label: "None", value: "none" },
      ],
      defaultValue: [],
    }),

    caloriesBurn: integer({
      ui: {
        description: "Estimated calories burned per session",
      },
    }),

    ...trackingFields,
  },
});
