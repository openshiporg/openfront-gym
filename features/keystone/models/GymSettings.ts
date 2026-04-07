import { list } from "@keystone-6/core";
import { text, integer, decimal, json } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const GymSettings = list({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageSettings,
      update: permissions.canManageSettings,
      delete: permissions.canManageSettings,
    },
  },
  isSingleton: true,
  graphql: {
    plural: "gymSettingsItems",
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      ui: { description: "Public gym/storefront name" },
    }),

    tagline: text({
      defaultValue: "Movement is art. The body of work is you.",
      ui: { description: "Short brand tagline" },
    }),

    description: text({
      ui: {
        displayMode: "textarea",
        description: "Short public business description",
      },
    }),

    address: text({
      ui: { description: "Primary public address" },
    }),

    phone: text({
      ui: { description: "Primary public phone" },
    }),

    email: text({
      ui: { description: "Primary public email" },
    }),

    currencyCode: text({
      defaultValue: "USD",
    }),

    locale: text({
      defaultValue: "en-US",
    }),

    timezone: text({
      defaultValue: "America/New_York",
    }),

    countryCode: text({
      defaultValue: "US",
    }),

    hours: json({
      defaultValue: {
        monday: "5:00 AM - 11:00 PM",
        tuesday: "5:00 AM - 11:00 PM",
        wednesday: "5:00 AM - 11:00 PM",
        thursday: "5:00 AM - 11:00 PM",
        friday: "5:00 AM - 10:00 PM",
        saturday: "6:00 AM - 8:00 PM",
        sunday: "7:00 AM - 7:00 PM",
      },
      ui: { description: "Operating hours by day" },
    }),

    heroEyebrow: text({
      defaultValue: "Performance without compromise",
    }),

    heroHeadline: text({
      defaultValue: "Movement is art.\nThe body of work\nis you.",
    }),

    heroSubheadline: text({
      defaultValue:
        "A modern gym storefront with memberships, classes, coaching, and facility access configured from one operational system.",
    }),

    heroPrimaryCtaLabel: text({
      defaultValue: "Start membership",
    }),

    heroPrimaryCtaHref: text({
      defaultValue: "/join",
    }),

    heroSecondaryCtaLabel: text({
      defaultValue: "View schedule",
    }),

    heroSecondaryCtaHref: text({
      defaultValue: "/schedule",
    }),

    promoBanner: text({
      defaultValue: "Movement is art. The body of work is you.",
    }),

    footerTagline: text({
      defaultValue: "Structured programming, confident operations, and a better member experience.",
    }),

    copyrightName: text({
      defaultValue: "Openfront Gym",
    }),

    facilityHeadline: text({
      defaultValue: "Facility systems",
    }),

    facilityDescription: text({
      defaultValue:
        "Training, coaching, recovery, and member access all live in one coordinated environment.",
    }),

    facilityHighlights: json({
      defaultValue: [],
      ui: { description: "Public facility cards/sections" },
    }),

    heroStats: json({
      defaultValue: [],
      ui: { description: "Hero stat cards" },
    }),

    contactTopics: json({
      defaultValue: [],
      ui: { description: "Contact page topics/cards" },
    }),

    rating: decimal({
      precision: 2,
      scale: 1,
      defaultValue: "4.8",
    }),

    reviewCount: integer({
      defaultValue: 0,
    }),

    ...trackingFields,
  },
});
