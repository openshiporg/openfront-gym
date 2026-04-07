"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core23 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session);
}
var permissions = {
  canCreateRecords: ({ session }) => session?.data.role?.canCreateRecords ?? false,
  canManageAllRecords: ({ session }) => session?.data.role?.canManageAllRecords ?? false,
  canManagePeople: ({ session }) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }) => session?.data.role?.canManageRoles ?? false,
  canAccessDashboard: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
  canManageOnboarding: ({ session }) => session?.data.role?.canManageOnboarding ?? false,
  canManageSettings: ({ session }) => session?.data.role?.canManageSettings ?? false,
  isInstructor: ({ session }) => session?.data.role?.isInstructor ?? false
};
var rules = {
  canReadRecords: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canManageAllRecords) {
      return true;
    }
    if (session.data.role?.isInstructor) {
      return {
        OR: [
          { instructor: { user: { id: { equals: session.itemId } } } },
          { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } },
          { member: { user: { id: { equals: session.itemId } } } }
        ]
      };
    }
    return { id: { equals: session.itemId } };
  },
  canManageRecords: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canManageAllRecords) return true;
    if (session.data.role?.isInstructor) {
      return {
        OR: [
          { instructor: { user: { id: { equals: session.itemId } } } },
          { classInstance: { instructor: { user: { id: { equals: session.itemId } } } } }
        ]
      };
    }
    return { id: { equals: session.itemId } };
  },
  canReadPeople: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canSeeOtherPeople) return true;
    return { id: { equals: session.itemId } };
  },
  canUpdatePeople: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canEditOtherPeople) return true;
    return { id: { equals: session.itemId } };
  }
};

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      query: () => true,
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "role", "membership"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    // Gym-specific relationships
    membership: (0, import_fields2.relationship)({
      ref: "Membership.member",
      many: false
    }),
    // NOTE: ClassBooking now references Member model instead of User
    // classBookings: relationship({
    //   ref: 'ClassBooking.member',
    //   many: true,
    // }),
    payments: (0, import_fields2.relationship)({
      ref: "MembershipPayment.member",
      many: true
    }),
    // Stripe integration
    stripeCustomerId: (0, import_fields2.text)({
      ui: {
        description: "Stripe Customer ID"
      }
    }),
    phone: (0, import_fields2.text)({
      ui: {
        description: "Member phone number"
      }
    }),
    emergencyContact: (0, import_fields2.text)({
      ui: {
        description: "Emergency contact name and phone"
      }
    }),
    onboardingStatus: (0, import_fields2.select)({
      type: "string",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" }
      ],
      defaultValue: "not_started",
      validation: { isRequired: true },
      ui: {
        description: "Tracks dashboard onboarding state for this user"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: () => true
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    canCreateRecords: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageAllRecords: (0, import_fields3.checkbox)({ defaultValue: false }),
    canSeeOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canEditOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageRoles: (0, import_fields3.checkbox)({ defaultValue: false }),
    canAccessDashboard: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageOnboarding: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageSettings: (0, import_fields3.checkbox)({ defaultValue: false }),
    isInstructor: (0, import_fields3.checkbox)({ defaultValue: false }),
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Member.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
var Member = (0, import_core3.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "membershipTier", "status", "joinDate"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.data.member?.id === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: { isRequired: true },
      ui: {
        description: "Full name of the member"
      }
    }),
    email: (0, import_fields4.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Member email address"
      }
    }),
    phone: (0, import_fields4.text)({
      ui: {
        description: "Primary phone number"
      }
    }),
    dateOfBirth: (0, import_fields4.timestamp)({
      ui: {
        description: "Date of birth for age verification and birthday promotions"
      }
    }),
    joinDate: (0, import_fields4.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Date member joined the gym"
      }
    }),
    membershipTier: (0, import_fields4.relationship)({
      ref: "MembershipTier",
      ui: {
        displayMode: "select",
        description: "Current membership plan"
      }
    }),
    emergencyContactName: (0, import_fields4.text)({
      ui: {
        description: "Emergency contact full name"
      }
    }),
    emergencyContactPhone: (0, import_fields4.text)({
      ui: {
        description: "Emergency contact phone number"
      }
    }),
    healthNotes: (0, import_fields4.json)({
      ui: {
        views: "./fields/json-view",
        description: "Medical conditions, injuries, or health considerations (stored as JSON)"
      },
      defaultValue: { conditions: [], injuries: [], notes: "" }
    }),
    profilePhoto: (0, import_fields4.image)({
      storage: "my_images"
    }),
    status: (0, import_fields4.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "active",
      validation: { isRequired: true },
      ui: {
        description: "Member account status"
      }
    }),
    // Relationship to User for authentication
    user: (0, import_fields4.relationship)({
      ref: "User",
      ui: {
        description: "Linked user account for authentication"
      }
    }),
    // Relationships to other entities
    bookings: (0, import_fields4.relationship)({
      ref: "ClassBooking.member",
      many: true,
      ui: {
        description: "Class bookings made by this member"
      }
    }),
    // NOTE: Uncomment these as the models are created
    checkIns: (0, import_fields4.relationship)({
      ref: "CheckIn.member",
      many: true,
      ui: {
        description: "Check-in history"
      }
    }),
    payments: (0, import_fields4.relationship)({
      ref: "GymPayment.member",
      many: true,
      ui: {
        description: "Payment history"
      }
    }),
    workoutLogs: (0, import_fields4.relationship)({
      ref: "WorkoutLog.member",
      many: true,
      ui: {
        description: "Workout tracking history"
      }
    }),
    subscriptions: (0, import_fields4.relationship)({
      ref: "Subscription.member",
      many: true,
      ui: {
        description: "Subscription billing history"
      }
    }),
    waitlistEntries: (0, import_fields4.relationship)({
      ref: "Waitlist.member",
      many: true,
      ui: {
        description: "Waitlist entries for full classes"
      }
    }),
    attendanceRecords: (0, import_fields4.relationship)({
      ref: "AttendanceRecord.member",
      many: true,
      ui: {
        description: "Class attendance tracking"
      }
    }),
    lifetimeValue: (0, import_fields4.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const payments = await sudoContext.query.GymPayment.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            query: "amount status"
          });
          return payments.filter((p) => p.status === "completed" || p.status === "succeeded").reduce((sum, p) => sum + (p.amount || 0), 0) / 100;
        }
      }),
      ui: { description: "Total lifetime payments in dollars" }
    }),
    membershipLengthDays: (0, import_fields4.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.Int,
        async resolve(item, args, context) {
          const joinDate = item.joinDate;
          if (!joinDate) return 0;
          const now = /* @__PURE__ */ new Date();
          const diffTime = Math.abs(now.getTime() - new Date(joinDate).getTime());
          return Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
        }
      }),
      ui: { description: "Days since member joined" }
    }),
    attendanceRate: (0, import_fields4.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.id.toString() } } }
          });
          if (totalRecords === 0) return 0;
          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.id.toString() } } },
                { attended: { equals: true } }
              ]
            }
          });
          return Math.round(attendedRecords / totalRecords * 100);
        }
      }),
      ui: { description: "Class attendance rate percentage" }
    }),
    lastCheckIn: (0, import_fields4.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.DateTime,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const checkIns = await sudoContext.query.CheckIn.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            orderBy: { checkInTime: "desc" },
            take: 1,
            query: "checkInTime"
          });
          return checkIns[0]?.checkInTime || null;
        }
      }),
      ui: { description: "Last gym check-in timestamp" }
    }),
    currentMembershipTier: (0, import_fields4.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.object()({
          name: "MemberCurrentTier",
          fields: {
            id: import_core3.graphql.field({
              type: import_core3.graphql.ID,
              resolve: (source) => source.id
            }),
            name: import_core3.graphql.field({
              type: import_core3.graphql.String,
              resolve: (source) => source.name
            })
          }
        }),
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const member = await sudoContext.query.Member.findOne({
            where: { id: item.id.toString() },
            query: "membershipTier { id name }"
          });
          return member?.membershipTier || null;
        }
      }),
      ui: {
        description: "Current membership tier details",
        query: `{
          id
          name
        }`
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MembershipTier.ts
var import_core4 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var MembershipTier = (0, import_core4.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "monthlyPrice", "annualPrice", "classCreditsPerMonth"]
    }
  },
  fields: {
    name: (0, import_fields5.text)({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Basic, Premium, Unlimited"
      }
    }),
    description: (0, import_fields_document.document)({
      formatting: true,
      links: true
    }),
    monthlyPrice: (0, import_fields5.float)({
      validation: { isRequired: true },
      ui: {
        description: "Monthly subscription price"
      }
    }),
    annualPrice: (0, import_fields5.float)({
      validation: { isRequired: true },
      ui: {
        description: "Annual subscription price (with discount)"
      }
    }),
    classCreditsPerMonth: (0, import_fields5.integer)({
      validation: { isRequired: true },
      defaultValue: 0,
      ui: {
        description: "Number of class credits per month (-1 for unlimited)"
      }
    }),
    accessHours: (0, import_fields5.text)({
      defaultValue: "limited",
      ui: {
        description: "e.g., '24/7' or 'limited' (6am-10pm)"
      }
    }),
    guestPasses: (0, import_fields5.integer)({
      defaultValue: 0,
      ui: {
        description: "Number of guest passes per month"
      }
    }),
    personalTrainingSessions: (0, import_fields5.integer)({
      defaultValue: 0,
      ui: {
        description: "Number of personal training sessions included"
      }
    }),
    freezeAllowed: (0, import_fields5.checkbox)({
      defaultValue: false,
      ui: {
        description: "Can member freeze their membership?"
      }
    }),
    contractLength: (0, import_fields5.integer)({
      defaultValue: 0,
      ui: {
        description: "Contract length in months (0 for month-to-month)"
      }
    }),
    // Stripe integration
    stripeMonthlyPriceId: (0, import_fields5.text)({
      ui: {
        description: "Stripe Price ID for monthly billing"
      }
    }),
    stripeAnnualPriceId: (0, import_fields5.text)({
      ui: {
        description: "Stripe Price ID for annual billing"
      }
    }),
    stripeProductId: (0, import_fields5.text)({
      ui: {
        description: "Stripe Product ID"
      }
    }),
    // Additional fields from todo requirements
    price: (0, import_fields5.integer)({
      ui: {
        description: "Base price in cents (for backward compatibility)"
      }
    }),
    billingInterval: (0, import_fields5.select)({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Quarterly", value: "quarterly" },
        { label: "Annual", value: "annual" }
      ],
      defaultValue: "monthly",
      ui: {
        description: "Default billing interval for this tier"
      }
    }),
    features: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        views: "./fields/json-view",
        description: "List of features included in this tier (stored as JSON array)"
      }
    }),
    maxClassBookings: (0, import_fields5.integer)({
      defaultValue: 0,
      ui: {
        description: "Maximum number of concurrent class bookings allowed (0 = unlimited)"
      }
    }),
    hasGuestPrivileges: (0, import_fields5.checkbox)({
      defaultValue: false,
      ui: {
        description: "Can members bring guests?"
      }
    }),
    accessHoursJson: (0, import_fields5.json)({
      defaultValue: { type: "limited", hours: "6am-10pm" },
      ui: {
        views: "./fields/json-view",
        description: "Access hours configuration (stored as JSON)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Membership.ts
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var Membership = (0, import_core5.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "tier", "status", "billingCycle", "nextBillingDate"]
    }
  },
  fields: {
    member: (0, import_fields6.relationship)({
      ref: "User.membership",
      ui: {
        displayMode: "select"
      }
    }),
    tier: (0, import_fields6.relationship)({
      ref: "MembershipTier",
      ui: {
        displayMode: "select"
      }
    }),
    status: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Frozen", value: "frozen" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Expired", value: "expired" },
        { label: "Past Due", value: "past-due" }
      ],
      defaultValue: "active",
      validation: { isRequired: true }
    }),
    startDate: (0, import_fields6.timestamp)({
      validation: { isRequired: true }
    }),
    billingCycle: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" }
      ],
      defaultValue: "monthly",
      validation: { isRequired: true }
    }),
    nextBillingDate: (0, import_fields6.timestamp)(),
    autoRenew: (0, import_fields6.checkbox)({
      defaultValue: true
    }),
    classCreditsRemaining: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Remaining class credits for current billing period"
      }
    }),
    freezeStartDate: (0, import_fields6.timestamp)({
      ui: {
        description: "Start date of membership freeze"
      }
    }),
    freezeEndDate: (0, import_fields6.timestamp)({
      ui: {
        description: "End date of membership freeze"
      }
    }),
    payments: (0, import_fields6.relationship)({
      ref: "MembershipPayment.membership",
      many: true,
      ui: {
        description: "Payment history for this membership"
      }
    }),
    // Stripe integration - only set when membership is linked to Stripe subscription
    stripeSubscriptionId: (0, import_fields6.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      ui: {
        description: "Stripe Subscription ID (only for Stripe-billed memberships)"
      }
    }),
    cancelReason: (0, import_fields6.text)({
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation"
      }
    }),
    cancelledAt: (0, import_fields6.timestamp)({
      ui: {
        description: "When the membership was cancelled"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MembershipPayment.ts
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var MembershipPayment = (0, import_core6.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "amount", "status", "paymentDate", "paymentType"]
    }
  },
  fields: {
    member: (0, import_fields7.relationship)({
      ref: "User.payments",
      ui: {
        displayMode: "select"
      }
    }),
    membership: (0, import_fields7.relationship)({
      ref: "Membership.payments",
      ui: {
        displayMode: "select",
        description: "Associated membership (if applicable)"
      }
    }),
    amount: (0, import_fields7.float)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in dollars"
      }
    }),
    paymentType: (0, import_fields7.select)({
      type: "string",
      options: [
        { label: "Membership", value: "membership" },
        { label: "Class Pack", value: "class-pack" },
        { label: "Personal Training", value: "personal-training" },
        { label: "Day Pass", value: "day-pass" },
        { label: "Late Cancel Fee", value: "late-cancel-fee" },
        { label: "Initiation Fee", value: "initiation-fee" },
        { label: "Freeze Fee", value: "freeze-fee" },
        { label: "Other", value: "other" }
      ],
      defaultValue: "membership",
      validation: { isRequired: true }
    }),
    status: (0, import_fields7.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" },
        { label: "Disputed", value: "disputed" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentDate: (0, import_fields7.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" }
    }),
    paymentMethod: (0, import_fields7.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit-card" },
        { label: "Debit Card", value: "debit-card" },
        { label: "ACH/Bank Transfer", value: "ach" },
        { label: "Cash", value: "cash" },
        { label: "Check", value: "check" }
      ],
      defaultValue: "credit-card"
    }),
    // Stripe-specific fields
    stripePaymentIntentId: (0, import_fields7.text)({
      ui: {
        description: "Stripe Payment Intent ID"
      }
    }),
    stripeChargeId: (0, import_fields7.text)({
      ui: {
        description: "Stripe Charge ID"
      }
    }),
    stripeInvoiceId: (0, import_fields7.text)({
      ui: {
        description: "Stripe Invoice ID (for subscriptions)"
      }
    }),
    // Receipt information
    receiptNumber: (0, import_fields7.text)({
      isIndexed: true,
      ui: {
        description: "Internal receipt number"
      }
    }),
    receiptUrl: (0, import_fields7.text)({
      ui: {
        description: "URL to the receipt (from Stripe or generated)"
      }
    }),
    // Metadata
    description: (0, import_fields7.text)({
      ui: {
        description: "Description of the payment (e.g., 'Monthly Premium Membership')"
      }
    }),
    notes: (0, import_fields7.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    isRecurring: (0, import_fields7.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this part of a recurring subscription?"
      }
    }),
    refundedAt: (0, import_fields7.timestamp)({
      ui: {
        description: "When this payment was refunded"
      }
    }),
    refundAmount: (0, import_fields7.float)({
      ui: {
        description: "Amount refunded (partial or full)"
      }
    }),
    refundReason: (0, import_fields7.text)({
      ui: {
        description: "Reason for refund"
      }
    }),
    processedBy: (0, import_fields7.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed this payment (for manual payments)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Subscription.ts
var import_core7 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var Subscription = (0, import_core7.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "membershipTier", "status", "startDate", "nextBillingDate"]
    }
  },
  fields: {
    member: (0, import_fields8.relationship)({
      ref: "Member.subscriptions",
      ui: {
        displayMode: "select",
        description: "Member who owns this subscription"
      }
    }),
    membershipTier: (0, import_fields8.relationship)({
      ref: "MembershipTier",
      ui: {
        displayMode: "select",
        description: "Membership tier for this subscription"
      }
    }),
    status: (0, import_fields8.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Past Due", value: "past_due" },
        { label: "Paused", value: "paused" }
      ],
      defaultValue: "active",
      validation: { isRequired: true },
      ui: {
        description: "Current subscription status"
      }
    }),
    startDate: (0, import_fields8.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      ui: {
        description: "Subscription start date"
      }
    }),
    nextBillingDate: (0, import_fields8.timestamp)({
      ui: {
        description: "Next scheduled billing date"
      }
    }),
    cancelledAt: (0, import_fields8.timestamp)({
      ui: {
        description: "Date subscription was cancelled"
      }
    }),
    pausedAt: (0, import_fields8.timestamp)({
      ui: {
        description: "Date subscription was paused"
      }
    }),
    paymentMethod: (0, import_fields8.relationship)({
      ref: "PaymentMethod.subscriptions",
      ui: {
        displayMode: "select",
        description: "Payment method used for billing"
      }
    }),
    billingHistory: (0, import_fields8.relationship)({
      ref: "GymPayment.subscription",
      many: true,
      ui: {
        description: "Payment history for this subscription"
      }
    }),
    // Stripe integration - required because Subscription records are only created from Stripe webhooks
    stripeSubscriptionId: (0, import_fields8.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Stripe Subscription ID for automatic billing"
      }
    }),
    stripeCustomerId: (0, import_fields8.text)({
      ui: {
        description: "Stripe Customer ID"
      }
    }),
    ...trackingFields
  },
  hooks: {
    // TODO: Add beforeOperation hook for automatic billing logic
    // This will be implemented when integrating with Stripe webhooks
  }
});

// features/keystone/models/GymPayment.ts
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var GymPayment = (0, import_core8.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "amount", "status", "paymentDate", "subscription"]
    }
  },
  fields: {
    member: (0, import_fields9.relationship)({
      ref: "Member.payments",
      ui: {
        displayMode: "select",
        description: "Member who made the payment"
      }
    }),
    subscription: (0, import_fields9.relationship)({
      ref: "Subscription.billingHistory",
      ui: {
        displayMode: "select",
        description: "Associated subscription (if recurring payment)"
      }
    }),
    amount: (0, import_fields9.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in cents"
      }
    }),
    status: (0, import_fields9.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      ui: {
        description: "Payment status"
      }
    }),
    paymentDate: (0, import_fields9.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Date payment was processed"
      }
    }),
    metadata: (0, import_fields9.json)({
      defaultValue: {},
      ui: {
        views: "./fields/json-view",
        description: "Additional payment data from Stripe/PayPal (stored as JSON)"
      }
    }),
    // Stripe integration fields
    stripePaymentIntentId: (0, import_fields9.text)({
      ui: {
        description: "Stripe Payment Intent ID"
      }
    }),
    stripeChargeId: (0, import_fields9.text)({
      ui: {
        description: "Stripe Charge ID"
      }
    }),
    stripeInvoiceId: (0, import_fields9.text)({
      ui: {
        description: "Stripe Invoice ID"
      }
    }),
    receiptNumber: (0, import_fields9.text)({
      isIndexed: true,
      ui: {
        description: "Receipt number for this payment"
      }
    }),
    description: (0, import_fields9.text)({
      ui: {
        displayMode: "textarea",
        description: "Payment description"
      }
    }),
    refundedAt: (0, import_fields9.timestamp)({
      ui: {
        description: "Date payment was refunded"
      }
    }),
    refundAmount: (0, import_fields9.integer)({
      ui: {
        description: "Refund amount in cents"
      }
    }),
    // Virtual field for payment link to Stripe Dashboard
    paymentLink: (0, import_fields9.virtual)({
      field: import_core8.graphql.field({
        type: import_core8.graphql.String,
        resolve(item) {
          if (item.stripePaymentIntentId) {
            return `https://dashboard.stripe.com/payments/${item.stripePaymentIntentId}`;
          }
          return null;
        }
      }),
      ui: {
        description: "Link to payment in Stripe Dashboard"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentMethod.ts
var import_core9 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var PaymentMethod = (0, import_core9.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "type", "brand", "last4", "isDefault"]
    }
  },
  fields: {
    member: (0, import_fields10.relationship)({
      ref: "Member",
      ui: {
        displayMode: "select",
        description: "Member who owns this payment method"
      }
    }),
    type: (0, import_fields10.select)({
      type: "string",
      options: [
        { label: "Card", value: "card" },
        { label: "Bank Account", value: "bank" }
      ],
      defaultValue: "card",
      validation: { isRequired: true },
      ui: {
        description: "Payment method type"
      }
    }),
    last4: (0, import_fields10.text)({
      validation: { isRequired: true },
      ui: {
        description: "Last 4 digits of card/account number"
      }
    }),
    brand: (0, import_fields10.text)({
      ui: {
        description: "Card brand (Visa, Mastercard, etc.) or bank name"
      }
    }),
    isDefault: (0, import_fields10.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this the default payment method?"
      }
    }),
    // Stripe integration - required because PaymentMethod records are only created from Stripe
    stripePaymentMethodId: (0, import_fields10.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Stripe Payment Method ID"
      }
    }),
    expiryMonth: (0, import_fields10.text)({
      ui: {
        description: "Card expiry month (for cards)"
      }
    }),
    expiryYear: (0, import_fields10.text)({
      ui: {
        description: "Card expiry year (for cards)"
      }
    }),
    subscriptions: (0, import_fields10.relationship)({
      ref: "Subscription.paymentMethod",
      many: true,
      ui: {
        description: "Subscriptions using this payment method"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/CheckIn.ts
var import_core10 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var CheckIn = (0, import_core10.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "checkInTime", "checkOutTime", "method", "membershipValidated"]
    }
  },
  fields: {
    member: (0, import_fields11.relationship)({
      ref: "Member.checkIns",
      ui: {
        displayMode: "select",
        description: "Member checking in"
      }
    }),
    checkInTime: (0, import_fields11.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Check-in timestamp"
      }
    }),
    checkOutTime: (0, import_fields11.timestamp)({
      ui: {
        description: "Check-out timestamp (optional)"
      }
    }),
    location: (0, import_fields11.relationship)({
      ref: "Location",
      ui: {
        displayMode: "select",
        description: "Gym location where check-in occurred"
      }
    }),
    method: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "QR Code", value: "qr_code" },
        { label: "RFID", value: "rfid" },
        { label: "Manual", value: "manual" },
        { label: "App", value: "app" }
      ],
      defaultValue: "app",
      validation: { isRequired: true },
      ui: {
        description: "Check-in method used"
      }
    }),
    isGuest: (0, import_fields11.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this a guest check-in?"
      }
    }),
    guestName: (0, import_fields11.text)({
      ui: {
        description: "Guest name (if isGuest is true)"
      }
    }),
    membershipValidated: (0, import_fields11.checkbox)({
      defaultValue: false,
      ui: {
        description: "Has membership status been validated?"
      }
    }),
    validationNotes: (0, import_fields11.text)({
      ui: {
        displayMode: "textarea",
        description: "Notes from validation (e.g., membership expired, special access)"
      }
    }),
    ...trackingFields
  },
  hooks: {
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === "create" && resolvedData.member) {
        const sudoContext = context.sudo();
        const member = await sudoContext.query.Member.findOne({
          where: { id: resolvedData.member.connect.id },
          query: `
            id
            status
            user {
              id
              membership {
                id
                status
              }
            }
            subscriptions(where: { status: { equals: "active" } }) {
              id
              status
            }
          `
        });
        if (!member) {
          throw new Error("Member not found");
        }
        if (member.status !== "active") {
          throw new Error(`Cannot check in: Member status is ${member.status}`);
        }
        const hasActiveMembership = member.user?.membership?.status === "active";
        const hasActiveSubscription = !!member.subscriptions?.length;
        if (!hasActiveMembership && !hasActiveSubscription) {
          throw new Error("Cannot check in: No active membership or subscription found");
        }
        resolvedData.membershipValidated = true;
      }
    }
  }
});

// features/keystone/models/Location.ts
var import_core11 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
var Location = (0, import_core11.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "address", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields12.text)({
      validation: { isRequired: true },
      ui: {
        description: "Location name (e.g., Downtown Gym, West Side Branch)"
      }
    }),
    address: (0, import_fields12.text)({
      ui: {
        displayMode: "textarea",
        description: "Physical address of the location"
      }
    }),
    phone: (0, import_fields12.text)({
      ui: {
        description: "Location phone number"
      }
    }),
    isActive: (0, import_fields12.checkbox)({
      defaultValue: true,
      ui: {
        description: "Is this location currently active?"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/GymSettings.ts
var import_core12 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var GymSettings = (0, import_core12.list)({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageSettings,
      update: permissions.canManageSettings,
      delete: permissions.canManageSettings
    }
  },
  isSingleton: true,
  graphql: {
    plural: "gymSettingsItems"
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"]
    }
  },
  fields: {
    name: (0, import_fields13.text)({
      validation: { isRequired: true },
      ui: { description: "Public gym/storefront name" }
    }),
    tagline: (0, import_fields13.text)({
      defaultValue: "Movement is art. The body of work is you.",
      ui: { description: "Short brand tagline" }
    }),
    description: (0, import_fields13.text)({
      ui: {
        displayMode: "textarea",
        description: "Short public business description"
      }
    }),
    address: (0, import_fields13.text)({
      ui: { description: "Primary public address" }
    }),
    phone: (0, import_fields13.text)({
      ui: { description: "Primary public phone" }
    }),
    email: (0, import_fields13.text)({
      ui: { description: "Primary public email" }
    }),
    currencyCode: (0, import_fields13.text)({
      defaultValue: "USD"
    }),
    locale: (0, import_fields13.text)({
      defaultValue: "en-US"
    }),
    timezone: (0, import_fields13.text)({
      defaultValue: "America/New_York"
    }),
    countryCode: (0, import_fields13.text)({
      defaultValue: "US"
    }),
    hours: (0, import_fields13.json)({
      defaultValue: {
        monday: "5:00 AM - 11:00 PM",
        tuesday: "5:00 AM - 11:00 PM",
        wednesday: "5:00 AM - 11:00 PM",
        thursday: "5:00 AM - 11:00 PM",
        friday: "5:00 AM - 10:00 PM",
        saturday: "6:00 AM - 8:00 PM",
        sunday: "7:00 AM - 7:00 PM"
      },
      ui: { description: "Operating hours by day" }
    }),
    heroEyebrow: (0, import_fields13.text)({
      defaultValue: "Performance without compromise"
    }),
    heroHeadline: (0, import_fields13.text)({
      defaultValue: "Movement is art.\nThe body of work\nis you."
    }),
    heroSubheadline: (0, import_fields13.text)({
      defaultValue: "A modern gym storefront with memberships, classes, coaching, and facility access configured from one operational system."
    }),
    heroPrimaryCtaLabel: (0, import_fields13.text)({
      defaultValue: "Start membership"
    }),
    heroPrimaryCtaHref: (0, import_fields13.text)({
      defaultValue: "/join"
    }),
    heroSecondaryCtaLabel: (0, import_fields13.text)({
      defaultValue: "View schedule"
    }),
    heroSecondaryCtaHref: (0, import_fields13.text)({
      defaultValue: "/schedule"
    }),
    promoBanner: (0, import_fields13.text)({
      defaultValue: "Movement is art. The body of work is you."
    }),
    footerTagline: (0, import_fields13.text)({
      defaultValue: "Structured programming, confident operations, and a better member experience."
    }),
    copyrightName: (0, import_fields13.text)({
      defaultValue: "Openfront Gym"
    }),
    facilityHeadline: (0, import_fields13.text)({
      defaultValue: "Facility systems"
    }),
    facilityDescription: (0, import_fields13.text)({
      defaultValue: "Training, coaching, recovery, and member access all live in one coordinated environment."
    }),
    facilityHighlights: (0, import_fields13.json)({
      defaultValue: [],
      ui: { description: "Public facility cards/sections" }
    }),
    heroStats: (0, import_fields13.json)({
      defaultValue: [],
      ui: { description: "Hero stat cards" }
    }),
    contactTopics: (0, import_fields13.json)({
      defaultValue: [],
      ui: { description: "Contact page topics/cards" }
    }),
    rating: (0, import_fields13.decimal)({
      precision: 2,
      scale: 1,
      defaultValue: "4.8"
    }),
    reviewCount: (0, import_fields13.integer)({
      defaultValue: 0
    }),
    ...trackingFields
  }
});

// features/keystone/models/WorkoutLog.ts
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var WorkoutLog = (0, import_core13.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "title", "date", "duration"]
    }
  },
  fields: {
    member: (0, import_fields14.relationship)({
      ref: "Member.workoutLogs",
      ui: {
        displayMode: "select",
        description: "Member who performed this workout"
      }
    }),
    date: (0, import_fields14.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Workout date"
      }
    }),
    title: (0, import_fields14.text)({
      ui: {
        description: "Workout title (e.g., Chest Day, Full Body)"
      }
    }),
    duration: (0, import_fields14.integer)({
      ui: {
        description: "Workout duration in minutes"
      }
    }),
    notes: (0, import_fields14.text)({
      ui: {
        displayMode: "textarea",
        description: "Workout notes and observations"
      }
    }),
    workoutSets: (0, import_fields14.relationship)({
      ref: "WorkoutSet.workoutLog",
      many: true,
      ui: {
        description: "Sets performed in this workout"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/WorkoutSet.ts
var import_core14 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var WorkoutSet = (0, import_core14.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["workoutLog", "exercise", "setNumber", "reps", "weight"]
    }
  },
  fields: {
    workoutLog: (0, import_fields15.relationship)({
      ref: "WorkoutLog.workoutSets",
      ui: {
        displayMode: "select",
        description: "Workout log this set belongs to"
      }
    }),
    exercise: (0, import_fields15.relationship)({
      ref: "Exercise",
      ui: {
        displayMode: "select",
        description: "Exercise performed"
      }
    }),
    setNumber: (0, import_fields15.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Set number in the workout"
      }
    }),
    reps: (0, import_fields15.integer)({
      ui: {
        description: "Number of repetitions"
      }
    }),
    weight: (0, import_fields15.float)({
      ui: {
        description: "Weight used (in pounds or kg)"
      }
    }),
    duration: (0, import_fields15.integer)({
      ui: {
        description: "Duration in seconds (for timed exercises)"
      }
    }),
    restTime: (0, import_fields15.integer)({
      ui: {
        description: "Rest time after this set (in seconds)"
      }
    }),
    notes: (0, import_fields15.text)({
      ui: {
        displayMode: "textarea",
        description: "Notes about this set (form, difficulty, etc.)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Exercise.ts
var import_core15 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var Exercise = (0, import_core15.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "category", "equipment"]
    }
  },
  fields: {
    name: (0, import_fields16.text)({
      validation: { isRequired: true },
      ui: {
        description: "Exercise name (e.g., Bench Press, Squats)"
      }
    }),
    category: (0, import_fields16.select)({
      type: "string",
      options: [
        { label: "Strength", value: "strength" },
        { label: "Cardio", value: "cardio" },
        { label: "Flexibility", value: "flexibility" },
        { label: "Balance", value: "balance" },
        { label: "Functional", value: "functional" }
      ],
      validation: { isRequired: true },
      ui: {
        description: "Exercise category"
      }
    }),
    muscleGroup: (0, import_fields16.json)({
      defaultValue: [],
      ui: {
        views: "./fields/json-view",
        description: "Target muscle groups (stored as JSON array)"
      }
    }),
    equipment: (0, import_fields16.text)({
      ui: {
        description: "Equipment needed (e.g., Barbell, Dumbbells, None)"
      }
    }),
    description: (0, import_fields16.text)({
      ui: {
        displayMode: "textarea",
        description: "Exercise description and proper form instructions"
      }
    }),
    videoUrl: (0, import_fields16.text)({
      ui: {
        description: "URL to demonstration video"
      }
    }),
    difficulty: (0, import_fields16.select)({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" }
      ],
      defaultValue: "beginner",
      ui: {
        description: "Exercise difficulty level"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Waitlist.ts
var import_core16 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
var Waitlist = (0, import_core16.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "classSchedule", "position", "status", "addedAt"]
    }
  },
  fields: {
    member: (0, import_fields17.relationship)({
      ref: "Member.waitlistEntries",
      ui: {
        displayMode: "select",
        description: "Member on the waitlist"
      }
    }),
    classSchedule: (0, import_fields17.relationship)({
      ref: "ClassSchedule",
      ui: {
        displayMode: "select",
        description: "Class the member is waiting for"
      }
    }),
    position: (0, import_fields17.integer)({
      ui: {
        description: "Position in the waitlist (auto-calculated based on addedAt)",
        itemView: { fieldMode: "read" },
        createView: { fieldMode: "hidden" }
      }
    }),
    addedAt: (0, import_fields17.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "When the member joined the waitlist"
      }
    }),
    notifiedAt: (0, import_fields17.timestamp)({
      ui: {
        description: "When the member was notified of an available spot"
      }
    }),
    status: (0, import_fields17.select)({
      type: "string",
      options: [
        { label: "Waiting", value: "waiting" },
        { label: "Notified", value: "notified" },
        { label: "Converted", value: "converted" },
        { label: "Expired", value: "expired" }
      ],
      defaultValue: "waiting",
      validation: { isRequired: true },
      ui: {
        description: "Waitlist entry status"
      }
    }),
    expiresAt: (0, import_fields17.timestamp)({
      ui: {
        description: "When the notification expires (typically 2 hours after notification)"
      }
    }),
    // Virtual field to calculate estimated wait time
    estimatedWaitTime: (0, import_fields17.virtual)({
      field: import_core16.graphql.field({
        type: import_core16.graphql.String,
        async resolve(item, args, context) {
          const position = item.position;
          if (position && position > 0) {
            const estimatedDays = Math.ceil(position / 2);
            return `~${estimatedDays} ${estimatedDays === 1 ? "day" : "days"}`;
          }
          return "Unknown";
        }
      }),
      ui: {
        description: "Estimated wait time based on position"
      }
    }),
    ...trackingFields
  },
  hooks: {
    // Calculate position automatically based on addedAt timestamp
    async beforeOperation({ operation, resolvedData, context, item }) {
      if (operation === "create" && resolvedData.classSchedule) {
        const sudoContext = context.sudo();
        const existingEntry = await sudoContext.query.Waitlist.findMany({
          where: {
            AND: [
              { member: { id: { equals: resolvedData.member.connect.id } } },
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { in: ["waiting", "notified"] } }
            ]
          },
          query: "id"
        });
        if (existingEntry && existingEntry.length > 0) {
          throw new Error("Member is already on the waitlist for this class");
        }
        const waitlistCount = await sudoContext.query.Waitlist.count({
          where: {
            AND: [
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { equals: "waiting" } }
            ]
          }
        });
        resolvedData.position = waitlistCount + 1;
      }
      if (operation === "update" && item && resolvedData.status) {
        if ((item.status === "waiting" || item.status === "notified") && (resolvedData.status === "converted" || resolvedData.status === "expired")) {
          const sudoContext = context.sudo();
          const classScheduleId = item.classScheduleId?.toString();
          const currentPosition = item.position;
          const allWaitingEntries = await sudoContext.query.Waitlist.findMany({
            where: {
              AND: [
                { classSchedule: { id: { equals: classScheduleId } } },
                { status: { equals: "waiting" } },
                { position: { gt: currentPosition } }
              ]
            },
            orderBy: { position: "asc" },
            query: "id position"
          });
          for (const entry of allWaitingEntries) {
            await sudoContext.query.Waitlist.updateOne({
              where: { id: entry.id },
              data: { position: entry.position - 1 }
            });
          }
        }
      }
    }
  }
});

// features/keystone/models/AttendanceRecord.ts
var import_core17 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
var AttendanceRecord = (0, import_core17.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "classSchedule", "attended", "markedAt", "lateArrival"]
    }
  },
  fields: {
    booking: (0, import_fields18.relationship)({
      ref: "ClassBooking",
      ui: {
        displayMode: "select",
        description: "Associated class booking"
      }
    }),
    classSchedule: (0, import_fields18.relationship)({
      ref: "ClassSchedule",
      ui: {
        displayMode: "select",
        description: "Class that was attended"
      }
    }),
    member: (0, import_fields18.relationship)({
      ref: "Member.attendanceRecords",
      ui: {
        displayMode: "select",
        description: "Member whose attendance is being tracked"
      }
    }),
    attended: (0, import_fields18.checkbox)({
      defaultValue: false,
      ui: {
        description: "Did the member attend?"
      }
    }),
    markedAt: (0, import_fields18.timestamp)({
      ui: {
        description: "When attendance was marked"
      }
    }),
    markedBy: (0, import_fields18.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who marked attendance"
      }
    }),
    noShowReason: (0, import_fields18.text)({
      ui: {
        displayMode: "textarea",
        description: "Reason for no-show (if applicable)"
      }
    }),
    lateArrival: (0, import_fields18.checkbox)({
      defaultValue: false,
      ui: {
        description: "Was the member late?"
      }
    }),
    minutesLate: (0, import_fields18.integer)({
      ui: {
        description: "How many minutes late (if lateArrival is true)"
      }
    }),
    // Virtual field for attendance rate per member
    // This would typically be calculated at the Member level, but included here as a reference
    memberAttendanceRate: (0, import_fields18.virtual)({
      field: import_core17.graphql.field({
        type: import_core17.graphql.Float,
        async resolve(item, args, context) {
          if (!item.memberId) return 0;
          const sudoContext = context.sudo();
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.memberId.toString() } } }
          });
          if (totalRecords === 0) return 0;
          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.memberId.toString() } } },
                { attended: { equals: true } }
              ]
            }
          });
          return attendedRecords / totalRecords * 100;
        }
      }),
      ui: {
        description: "Member attendance rate percentage"
      }
    }),
    ...trackingFields
  },
  hooks: {
    // Automatically create attendance records when class starts
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === "create") {
        if (!resolvedData.markedAt) {
          resolvedData.markedAt = /* @__PURE__ */ new Date();
        }
      }
    }
  }
});

// features/keystone/models/ClassType.ts
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var import_fields_document2 = require("@keystone-6/fields-document");
var ClassType = (0, import_core18.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "difficulty", "duration", "caloriesBurn"]
    }
  },
  fields: {
    name: (0, import_fields19.text)({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Yoga, Spin, HIIT, Boxing"
      }
    }),
    description: (0, import_fields_document2.document)({
      formatting: true,
      links: true
    }),
    difficulty: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "All Levels", value: "all-levels" }
      ],
      defaultValue: "all-levels",
      validation: { isRequired: true }
    }),
    duration: (0, import_fields19.integer)({
      validation: { isRequired: true },
      defaultValue: 60,
      ui: {
        description: "Typical duration in minutes"
      }
    }),
    equipmentNeeded: (0, import_fields19.multiselect)({
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
        { label: "None", value: "none" }
      ],
      defaultValue: []
    }),
    caloriesBurn: (0, import_fields19.integer)({
      ui: {
        description: "Estimated calories burned per session"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassSchedule.ts
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var ClassSchedule = (0, import_core19.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "instructor", "dayOfWeek", "startTime", "endTime", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields20.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the class (e.g., 'Morning Yoga', 'HIIT Blast')"
      }
    }),
    description: (0, import_fields20.text)({
      ui: {
        displayMode: "textarea",
        description: "Description of the class"
      }
    }),
    instructor: (0, import_fields20.relationship)({
      ref: "Instructor.classSchedules",
      ui: {
        displayMode: "select"
      }
    }),
    dayOfWeek: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Monday", value: "monday" },
        { label: "Tuesday", value: "tuesday" },
        { label: "Wednesday", value: "wednesday" },
        { label: "Thursday", value: "thursday" },
        { label: "Friday", value: "friday" },
        { label: "Saturday", value: "saturday" },
        { label: "Sunday", value: "sunday" }
      ],
      validation: { isRequired: true }
    }),
    startTime: (0, import_fields20.text)({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)"
      }
    }),
    endTime: (0, import_fields20.text)({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)"
      }
    }),
    maxCapacity: (0, import_fields20.integer)({
      validation: { isRequired: true },
      defaultValue: 20,
      ui: {
        description: "Maximum number of participants"
      }
    }),
    isActive: (0, import_fields20.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this class schedule is currently active"
      }
    }),
    // Relationship to specific instances
    instances: (0, import_fields20.relationship)({
      ref: "ClassInstance.classSchedule",
      many: true
    }),
    averageAttendance: (0, import_fields20.virtual)({
      field: import_core19.graphql.field({
        type: import_core19.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: { classSchedule: { id: { equals: item.id.toString() } } },
            query: "bookings { id }"
          });
          if (instances.length === 0) return 0;
          const totalAttendance = instances.reduce(
            (sum, inst) => sum + (inst.bookings?.length || 0),
            0
          );
          return Math.round(totalAttendance / instances.length * 10) / 10;
        }
      }),
      ui: { description: "Average number of attendees per class" }
    }),
    bookingRate: (0, import_fields20.virtual)({
      field: import_core19.graphql.field({
        type: import_core19.graphql.Float,
        async resolve(item, args, context) {
          const maxCapacity = item.maxCapacity;
          if (!maxCapacity) return 0;
          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: { classSchedule: { id: { equals: item.id.toString() } } },
            query: 'bookings(where: { status: { equals: "confirmed" } }) { id }'
          });
          if (instances.length === 0) return 0;
          const totalBooked = instances.reduce(
            (sum, inst) => sum + (inst.bookings?.length || 0),
            0
          );
          const totalCapacity = instances.length * maxCapacity;
          return Math.round(totalBooked / totalCapacity * 100);
        }
      }),
      ui: { description: "Booking rate as percentage of capacity" }
    }),
    totalRevenue: (0, import_fields20.virtual)({
      field: import_core19.graphql.field({
        type: import_core19.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const bookings = await sudoContext.query.ClassBooking.findMany({
            where: {
              classInstance: {
                classSchedule: { id: { equals: item.id.toString() } }
              },
              status: { equals: "confirmed" }
            },
            query: "id"
          });
          const classPrice = 15;
          return bookings.length * classPrice;
        }
      }),
      ui: { description: "Total revenue from this class schedule" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassBooking.ts
var import_core20 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var ClassBooking = (0, import_core20.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["classInstance", "member", "memberName", "status", "bookedAt"]
    }
  },
  fields: {
    // Link to specific class instance
    classInstance: (0, import_fields21.relationship)({
      ref: "ClassInstance.bookings",
      ui: {
        displayMode: "select",
        description: "The class instance being booked"
      }
    }),
    // Link to member
    member: (0, import_fields21.relationship)({
      ref: "Member.bookings",
      ui: {
        displayMode: "select",
        description: "The member who made the booking"
      }
    }),
    // Denormalized member info for quick access
    memberName: (0, import_fields21.text)({
      ui: {
        description: "Member's name at time of booking"
      }
    }),
    memberEmail: (0, import_fields21.text)({
      ui: {
        description: "Member's email at time of booking"
      }
    }),
    memberPhone: (0, import_fields21.text)({
      ui: {
        description: "Member's phone number"
      }
    }),
    notes: (0, import_fields21.text)({
      ui: {
        displayMode: "textarea",
        description: "Special notes or requests for this booking"
      }
    }),
    status: (0, import_fields21.select)({
      type: "string",
      options: [
        { label: "Confirmed", value: "confirmed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Waitlist", value: "waitlist" }
      ],
      defaultValue: "confirmed",
      validation: { isRequired: true }
    }),
    waitlistPosition: (0, import_fields21.integer)({
      ui: {
        description: "Position in waitlist (only applicable when status is 'waitlist')"
      }
    }),
    bookedAt: (0, import_fields21.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" }
    }),
    cancelledAt: (0, import_fields21.timestamp)({
      ui: {
        description: "When the booking was cancelled"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Instructor.ts
var import_core21 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var import_fields_document3 = require("@keystone-6/fields-document");
var Instructor = (0, import_core21.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["user", "specialties", "isActive"]
    },
    labelField: "user"
  },
  fields: {
    // Link to User account
    user: (0, import_fields22.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "The user account for this instructor"
      }
    }),
    bio: (0, import_fields_document3.document)({
      formatting: true,
      links: true
    }),
    // JSON array of specialties
    specialties: (0, import_fields22.json)({
      defaultValue: [],
      ui: {
        description: "Array of specialties (e.g., ['yoga', 'pilates', 'strength'])"
      }
    }),
    // JSON array of certifications
    certifications: (0, import_fields22.json)({
      defaultValue: [],
      ui: {
        description: "Array of certifications (e.g., ['ACE', 'NASM', 'RYT-200'])"
      }
    }),
    photo: (0, import_fields22.text)({
      ui: {
        description: "URL to instructor's photo"
      }
    }),
    isActive: (0, import_fields22.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this instructor is currently active"
      }
    }),
    // Relationships
    classSchedules: (0, import_fields22.relationship)({
      ref: "ClassSchedule.instructor",
      many: true
    }),
    classInstances: (0, import_fields22.relationship)({
      ref: "ClassInstance.instructor",
      many: true
    }),
    totalClassesTaught: (0, import_fields22.virtual)({
      field: import_core21.graphql.field({
        type: import_core21.graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: (/* @__PURE__ */ new Date()).toISOString() }
            }
          });
          return count;
        }
      }),
      ui: { description: "Total number of classes taught" }
    }),
    averageRating: (0, import_fields22.virtual)({
      field: import_core21.graphql.field({
        type: import_core21.graphql.Float,
        async resolve(item, args, context) {
          return 4.5;
        }
      }),
      ui: { description: "Average rating from members (placeholder)" }
    }),
    totalRevenue: (0, import_fields22.virtual)({
      field: import_core21.graphql.field({
        type: import_core21.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: (/* @__PURE__ */ new Date()).toISOString() }
            },
            query: 'bookings(where: { status: { equals: "confirmed" } }) { id }'
          });
          const totalBookings = instances.reduce(
            (sum, inst) => sum + (inst.bookings?.length || 0),
            0
          );
          const revenuePerClass = 15;
          return totalBookings * revenuePerClass;
        }
      }),
      ui: { description: "Total revenue attributed to this instructor" }
    }),
    upcomingClasses: (0, import_fields22.virtual)({
      field: import_core21.graphql.field({
        type: import_core21.graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { gte: (/* @__PURE__ */ new Date()).toISOString() }
            }
          });
          return count;
        }
      }),
      ui: { description: "Number of upcoming scheduled classes" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassInstance.ts
var import_core22 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
var ClassInstance = (0, import_core22.list)({
  access: {
    operation: {
      query: () => true,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    }
  },
  ui: {
    listView: {
      initialColumns: ["classSchedule", "date", "instructor", "isCancelled"]
    }
  },
  fields: {
    // Reference to the recurring schedule
    classSchedule: (0, import_fields23.relationship)({
      ref: "ClassSchedule.instances",
      ui: {
        displayMode: "select"
      }
    }),
    // Specific date for this instance
    date: (0, import_fields23.timestamp)({
      validation: { isRequired: true },
      ui: {
        description: "Specific date and time of this class occurrence"
      }
    }),
    // Override instructor for this specific instance (if different from schedule)
    instructor: (0, import_fields23.relationship)({
      ref: "Instructor.classInstances",
      ui: {
        displayMode: "select",
        description: "Override instructor (leave empty to use schedule default)"
      }
    }),
    // Override capacity for this specific instance
    maxCapacity: (0, import_fields23.integer)({
      ui: {
        description: "Override max capacity (leave empty to use schedule default)"
      }
    }),
    isCancelled: (0, import_fields23.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this class instance has been cancelled"
      }
    }),
    cancellationReason: (0, import_fields23.text)({
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation (if cancelled)"
      }
    }),
    // Bookings for this specific instance
    bookings: (0, import_fields23.relationship)({
      ref: "ClassBooking.classInstance",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  Member,
  MembershipTier,
  Membership,
  MembershipPayment,
  Subscription,
  GymPayment,
  PaymentMethod,
  CheckIn,
  Location,
  GymSettings,
  WorkoutLog,
  WorkoutSet,
  Exercise,
  Waitlist,
  AttendanceRecord,
  ClassType,
  ClassSchedule,
  ClassBooking,
  Instructor,
  ClassInstance
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(root, { data }, context) {
  const sudoContext = context.sudo();
  const session = context.session;
  if (!session?.itemId) {
    throw new Error("Not authenticated");
  }
  const existingUser = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: "id"
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  return await sudoContext.db.User.updateOne({
    where: { id: session.itemId },
    data
  });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/queries/billing.ts
async function getBillingStats(root, args, context) {
  const now = /* @__PURE__ */ new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sudoContext = context.sudo();
  const [
    activeSubscriptions,
    activeMemberships,
    pastDueSubscriptions,
    pastDueMemberships,
    completedPayments
  ] = await Promise.all([
    sudoContext.query.Subscription.count({
      where: { status: { equals: "active" } }
    }),
    sudoContext.query.Membership.count({
      where: { status: { equals: "active" } }
    }),
    sudoContext.query.Subscription.count({
      where: { status: { equals: "past_due" } }
    }),
    sudoContext.query.Membership.count({
      where: { status: { equals: "past-due" } }
    }),
    sudoContext.query.MembershipPayment.findMany({
      where: { status: { equals: "completed" } },
      query: "amount paymentDate"
    })
  ]);
  const totalRevenue = completedPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );
  const monthlyRevenue = completedPayments.filter((p) => new Date(p.paymentDate) >= startOfMonth).reduce((sum, p) => sum + (p.amount || 0), 0);
  return {
    totalRevenue,
    monthlyRevenue,
    activeSubscriptions,
    activeMemberships,
    pastDueCount: pastDueSubscriptions + pastDueMemberships
  };
}

// features/keystone/mutations/classBooking.ts
async function checkClassAvailability(root, args, context) {
  const { classInstanceId } = args;
  const classInstance = await context.query.ClassInstance.findOne({
    where: { id: classInstanceId },
    query: "id maxCapacity isCancelled classSchedule { maxCapacity }"
  });
  if (!classInstance) {
    throw new Error("Class instance not found");
  }
  if (classInstance.isCancelled) {
    return {
      available: false,
      spotsRemaining: 0,
      waitlistPosition: null,
      reason: "Class has been cancelled"
    };
  }
  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;
  const existingBookings = await context.query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      status: { equals: "confirmed" }
    }
  });
  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;
  let waitlistPosition = null;
  if (!available) {
    const waitlistCount = await context.query.ClassBooking.count({
      where: {
        classInstance: { id: { equals: classInstanceId } },
        status: { equals: "waitlist" }
      }
    });
    waitlistPosition = waitlistCount + 1;
  }
  return {
    available,
    spotsRemaining: Math.max(0, spotsRemaining),
    waitlistPosition,
    reason: available ? null : "Class is at capacity"
  };
}
async function getMemberAndUser(context, memberId) {
  const members = await context.query.Member.findMany({
    where: { id: { equals: memberId } },
    take: 1,
    query: "id name email phone user { id name email }"
  });
  const member = members[0];
  if (!member) throw new Error("Member not found");
  if (!member.user?.id) throw new Error("Member is not linked to a user account");
  return {
    member,
    userId: member.user.id,
    userName: member.user.name || member.name,
    userEmail: member.user.email || member.email
  };
}
async function getActiveMembershipForUser(context, userId) {
  const memberships = await context.query.Membership.findMany({
    where: {
      member: { id: { equals: userId } },
      status: { equals: "active" }
    },
    take: 1,
    query: "id classCreditsRemaining tier { classCreditsPerMonth }"
  });
  return memberships[0];
}
async function bookClass(root, args, context) {
  const { classInstanceId, memberId } = args;
  const availability = await checkClassAvailability(root, { classInstanceId }, context);
  const { member, userId, userName, userEmail } = await getMemberAndUser(context, memberId);
  const memberMembership = await getActiveMembershipForUser(context, userId);
  if (!memberMembership) {
    throw new Error("No active membership found");
  }
  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
  const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
  const hasCredits = hasUnlimitedCredits || creditsRemaining > 0;
  if (!hasCredits) {
    throw new Error("No class credits remaining");
  }
  const status = availability.available ? "confirmed" : "waitlist";
  const booking = await context.query.ClassBooking.createOne({
    data: {
      member: { connect: { id: member.id } },
      classInstance: { connect: { id: classInstanceId } },
      memberName: userName,
      memberEmail: userEmail,
      memberPhone: member.phone ?? null,
      status,
      waitlistPosition: status === "waitlist" ? availability.waitlistPosition : null,
      bookedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    query: "id status waitlistPosition bookedAt"
  });
  if (status === "confirmed" && !hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: creditsRemaining - 1
      }
    });
  }
  return {
    booking,
    creditsRemaining: hasUnlimitedCredits ? -1 : creditsRemaining - (status === "confirmed" ? 1 : 0)
  };
}
async function checkIn(root, args, context) {
  const { memberId, bookingId, classInstanceId } = args;
  const { member, userId, userName, userEmail } = await getMemberAndUser(context, memberId);
  const memberMembership = await getActiveMembershipForUser(context, userId);
  if (!memberMembership) {
    throw new Error("No active membership found");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (bookingId) {
    const booking = await context.query.ClassBooking.updateOne({
      where: { id: bookingId },
      data: {
        status: "confirmed"
      },
      query: "id status member { id name }"
    });
    return {
      success: true,
      booking,
      message: "Check-in successful"
    };
  }
  if (classInstanceId) {
    const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
    const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
    const hasCredits = hasUnlimitedCredits || creditsRemaining > 0;
    if (!hasCredits) {
      throw new Error("No class credits remaining for walk-in");
    }
    const availability = await checkClassAvailability(root, { classInstanceId }, context);
    if (!availability.available) {
      throw new Error("Class is at capacity, cannot process walk-in");
    }
    const booking = await context.query.ClassBooking.createOne({
      data: {
        member: { connect: { id: member.id } },
        classInstance: { connect: { id: classInstanceId } },
        memberName: userName,
        memberEmail: userEmail,
        memberPhone: member.phone ?? null,
        status: "confirmed",
        bookedAt: now
      },
      query: "id status bookedAt member { id name }"
    });
    if (!hasUnlimitedCredits) {
      await context.query.Membership.updateOne({
        where: { id: memberMembership.id },
        data: {
          classCreditsRemaining: creditsRemaining - 1
        }
      });
    }
    return {
      success: true,
      booking,
      message: "Walk-in check-in successful",
      creditsRemaining: hasUnlimitedCredits ? -1 : creditsRemaining - 1
    };
  }
  return {
    success: true,
    booking: null,
    message: "General gym check-in successful"
  };
}
async function promoteFromWaitlist(root, args, context) {
  const waitlistBookings = await context.query.ClassBooking.findMany({
    where: {
      classInstance: { id: { equals: args.classInstanceId } },
      status: { equals: "waitlist" }
    },
    orderBy: [{ bookedAt: "asc" }],
    take: 1,
    query: "id member { id user { id } } classInstance { id }"
  });
  if (!waitlistBookings.length) {
    return { promoted: false, message: "No members on waitlist" };
  }
  const bookingToPromote = waitlistBookings[0];
  const linkedUserId = bookingToPromote.member?.user?.id;
  if (!linkedUserId) {
    return { promoted: false, message: "Waitlisted member is not linked to a user account" };
  }
  const memberMembership = await getActiveMembershipForUser(context, linkedUserId);
  if (!memberMembership) {
    return { promoted: false, message: "Member no longer has active membership" };
  }
  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
  const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
  if (!hasUnlimitedCredits && creditsRemaining <= 0) {
    return { promoted: false, message: "Member has no class credits remaining" };
  }
  const promotedBooking = await context.query.ClassBooking.updateOne({
    where: { id: bookingToPromote.id },
    data: { status: "confirmed", waitlistPosition: null },
    query: "id status member { id name email }"
  });
  if (!hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: creditsRemaining - 1
      }
    });
  }
  return {
    promoted: true,
    booking: promotedBooking,
    message: "Member promoted from waitlist"
  };
}
async function kioskCheckIn(root, args, context) {
  const { memberId, pin } = args;
  if (!memberId && !pin) {
    return {
      success: false,
      message: "Please provide member ID or PIN",
      member: null,
      attendanceId: null
    };
  }
  let member = null;
  if (memberId) {
    const members = await context.query.Member.findMany({
      where: { id: { equals: memberId } },
      take: 1,
      query: `
        id
        name
        email
        user {
          id
          membership {
            id
            status
            tier { name }
            classCreditsRemaining
          }
        }
      `
    });
    member = members[0];
  } else if (pin) {
    const members = await context.query.Member.findMany({
      where: { email: { contains: pin, mode: "insensitive" } },
      take: 1,
      query: `
        id
        name
        email
        user {
          id
          membership {
            id
            status
            tier { name }
            classCreditsRemaining
          }
        }
      `
    });
    member = members[0];
  }
  if (!member) {
    return {
      success: false,
      message: pin ? "Invalid PIN. Please try again." : "Member not found.",
      member: null,
      attendanceId: null
    };
  }
  const membership = member.user?.membership;
  if (!membership) {
    return {
      success: false,
      message: "No membership found. Please see front desk.",
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        membership: null
      },
      attendanceId: null
    };
  }
  if (membership.status !== "active") {
    return {
      success: false,
      message: `Membership is ${membership.status}. Please see front desk.`,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        membership
      },
      attendanceId: null
    };
  }
  const attendanceId = `ATT-${Date.now()}-${member.id.slice(-4)}`;
  return {
    success: true,
    message: "Check-in successful! Have a great workout!",
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      membership
    },
    attendanceId
  };
}

// features/keystone/utils/stripe.ts
var import_stripe = __toESM(require("stripe"));
var getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Stripe secret key not configured. Set STRIPE_SECRET_KEY in environment variables.");
  }
  return new import_stripe.default(stripeKey, {
    apiVersion: "2023-10-16"
  });
};
var stripe = getStripeClient();
async function createCustomer({ email, name }) {
  const stripe2 = getStripeClient();
  const customer = await stripe2.customers.create({
    email,
    name,
    metadata: {
      source: "openfront-gym"
    }
  });
  return customer;
}
async function createSubscription({
  customerId,
  priceId,
  paymentMethodId
}) {
  const stripe2 = getStripeClient();
  if (paymentMethodId) {
    await stripe2.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });
    await stripe2.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
  }
  const subscription = await stripe2.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"]
  });
  return subscription;
}
async function createSetupIntent(customerId) {
  const stripe2 = getStripeClient();
  const setupIntent = await stripe2.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"]
  });
  return setupIntent;
}
async function cancelSubscription(subscriptionId) {
  const stripe2 = getStripeClient();
  const subscription = await stripe2.subscriptions.cancel(subscriptionId);
  return subscription;
}
async function pauseSubscription(subscriptionId, resumeDate) {
  const stripe2 = getStripeClient();
  const subscription = await stripe2.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: resumeDate ? Math.floor(resumeDate.getTime() / 1e3) : void 0
    }
  });
  return subscription;
}
async function resumeSubscription(subscriptionId) {
  const stripe2 = getStripeClient();
  const subscription = await stripe2.subscriptions.update(subscriptionId, {
    pause_collection: null
  });
  return subscription;
}
async function updateSubscription({
  subscriptionId,
  newPriceId
}) {
  const stripe2 = getStripeClient();
  const subscription = await stripe2.subscriptions.retrieve(subscriptionId);
  const updated = await stripe2.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId
      }
    ],
    proration_behavior: "create_prorations"
  });
  return updated;
}
async function createBillingPortalSession(customerId, returnUrl) {
  const stripe2 = getStripeClient();
  const session = await stripe2.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  return session;
}

// features/keystone/mutations/stripeSubscription.ts
async function createMembershipWithStripe(root, {
  email,
  name,
  password: password2,
  tierId,
  billingCycle,
  paymentMethodId
}, context) {
  const { db } = context.sudo();
  const tier = await db.MembershipTier.findOne({
    where: { id: tierId }
  });
  if (!tier) {
    throw new Error("Membership tier not found");
  }
  const stripePriceId = billingCycle === "monthly" ? tier.stripeMonthlyPriceId : tier.stripeAnnualPriceId;
  if (!stripePriceId) {
    throw new Error(`Stripe price not configured for ${billingCycle} billing`);
  }
  const stripeCustomer = await createCustomer({ email, name });
  const user = await db.User.createOne({
    data: {
      name,
      email,
      password: password2,
      stripeCustomerId: stripeCustomer.id
    }
  });
  const subscription = await createSubscription({
    customerId: stripeCustomer.id,
    priceId: stripePriceId,
    paymentMethodId
  });
  const nextBillingDate = /* @__PURE__ */ new Date();
  if (billingCycle === "monthly") {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  } else {
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  }
  const membership = await db.Membership.createOne({
    data: {
      member: { connect: { id: user.id } },
      tier: { connect: { id: tierId } },
      status: subscription.status === "active" ? "active" : "past-due",
      startDate: (/* @__PURE__ */ new Date()).toISOString(),
      billingCycle,
      nextBillingDate: nextBillingDate.toISOString(),
      autoRenew: true,
      classCreditsRemaining: tier.classCreditsPerMonth,
      stripeSubscriptionId: subscription.id
    }
  });
  const latestInvoice = subscription.latest_invoice;
  const paymentIntent = latestInvoice?.payment_intent;
  const clientSecret = paymentIntent?.client_secret;
  return {
    membership,
    user,
    subscriptionId: subscription.id,
    clientSecret,
    subscriptionStatus: subscription.status
  };
}
async function createStripeSetupIntent(root, { userId }, context) {
  const { db } = context.sudo();
  const user = await db.User.findOne({
    where: { id: userId }
  });
  if (!user || !user.stripeCustomerId) {
    throw new Error("User not found or not a Stripe customer");
  }
  const setupIntent = await createSetupIntent(user.stripeCustomerId);
  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id
  };
}
async function cancelMembership(root, { membershipId, reason }, context) {
  const { db } = context.sudo();
  const membership = await db.Membership.findOne({
    where: { id: membershipId }
  });
  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }
  const cancelledSubscription = await cancelSubscription(membership.stripeSubscriptionId);
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "cancelled",
      autoRenew: false,
      cancelReason: reason
    }
  });
  return {
    membership: updatedMembership,
    message: "Membership cancelled successfully"
  };
}
async function freezeMembership(root, {
  membershipId,
  startDate,
  endDate
}, context) {
  const { db } = context.sudo();
  const membership = await db.Membership.findOne({
    where: { id: membershipId }
  });
  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }
  await pauseSubscription(
    membership.stripeSubscriptionId,
    new Date(endDate)
  );
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "frozen",
      freezeStartDate: startDate,
      freezeEndDate: endDate
    }
  });
  return {
    membership: updatedMembership,
    message: "Membership frozen successfully"
  };
}
async function unfreezeMembership(root, { membershipId }, context) {
  const { db } = context.sudo();
  const membership = await db.Membership.findOne({
    where: { id: membershipId }
  });
  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }
  await resumeSubscription(membership.stripeSubscriptionId);
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "active",
      freezeStartDate: null,
      freezeEndDate: null
    }
  });
  return {
    membership: updatedMembership,
    message: "Membership resumed successfully"
  };
}
async function changeMembershipTier(root, {
  membershipId,
  newTierId
}, context) {
  const { db } = context.sudo();
  const membership = await db.Membership.findOne({
    where: { id: membershipId }
  });
  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }
  const newTier = await db.MembershipTier.findOne({
    where: { id: newTierId }
  });
  if (!newTier) {
    throw new Error("New membership tier not found");
  }
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) {
    throw new Error("Stripe price not configured for this tier");
  }
  await updateSubscription({
    subscriptionId: membership.stripeSubscriptionId,
    newPriceId
  });
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      tier: { connect: { id: newTierId } },
      classCreditsRemaining: newTier.classCreditsPerMonth
    }
  });
  return {
    membership: updatedMembership,
    message: "Membership tier updated successfully"
  };
}
async function getStripeBillingPortal(root, { userId, returnUrl }, context) {
  const { db } = context.sudo();
  const user = await db.User.findOne({
    where: { id: userId }
  });
  if (!user || !user.stripeCustomerId) {
    throw new Error("User not found or not a Stripe customer");
  }
  const session = await createBillingPortalSession(user.stripeCustomerId, returnUrl);
  return {
    url: session.url
  };
}

// features/keystone/mutations/index.ts
var graphql7 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql7`
      type Query {
        redirectToInit: Boolean
        checkClassAvailability(classInstanceId: ID!): ClassAvailabilityResult!
        getBillingStats: BillingStats!
      }

      input UserUpdateProfileInput {
        email: String
        name: String
        phone: String
        password: String
        onboardingStatus: String
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        bookClass(classInstanceId: ID!, memberId: ID!): BookClassResult!
        checkIn(memberId: ID!, bookingId: ID, classInstanceId: ID): CheckInResult!
        promoteFromWaitlist(classInstanceId: ID!): PromoteResult!
        kioskCheckIn(memberId: String, pin: String): KioskCheckInResult!

        # Stripe subscription mutations
        createMembershipWithStripe(
          email: String!
          name: String!
          password: String!
          tierId: ID!
          billingCycle: String!
          paymentMethodId: String
        ): CreateMembershipResult!

        createStripeSetupIntent(userId: ID!): SetupIntentResult!

        cancelMembership(membershipId: ID!, reason: String): MembershipActionResult!

        freezeMembership(
          membershipId: ID!
          startDate: String!
          endDate: String!
        ): MembershipActionResult!

        unfreezeMembership(membershipId: ID!): MembershipActionResult!

        changeMembershipTier(
          membershipId: ID!
          newTierId: ID!
        ): MembershipActionResult!

        getStripeBillingPortal(userId: ID!, returnUrl: String!): BillingPortalResult!
      }

      type ClassAvailabilityResult {
        available: Boolean!
        spotsRemaining: Int!
        waitlistPosition: Int
        reason: String
      }

      type BookClassResult {
        booking: ClassBooking
        creditsRemaining: Int!
      }

      type CheckInResult {
        success: Boolean!
        booking: ClassBooking
        message: String!
        creditsRemaining: Int
      }

      type PromoteResult {
        promoted: Boolean!
        booking: ClassBooking
        message: String!
      }

      type KioskMemberInfo {
        id: String!
        name: String!
        email: String!
        membership: KioskMembershipInfo
      }

      type KioskMembershipInfo {
        id: String!
        status: String!
        tier: KioskTierInfo
        classCreditsRemaining: Int
      }

      type KioskTierInfo {
        name: String!
      }

      type KioskCheckInResult {
        success: Boolean!
        message: String!
        member: KioskMemberInfo
        attendanceId: String
      }

      # Stripe subscription types
      type CreateMembershipResult {
        membership: Membership
        user: User
        subscriptionId: String!
        clientSecret: String
        subscriptionStatus: String!
      }

      type SetupIntentResult {
        clientSecret: String!
        setupIntentId: String!
      }

      type MembershipActionResult {
        membership: Membership
        message: String!
      }

      type BillingPortalResult {
        url: String!
      }

      type BillingStats {
        totalRevenue: Float!
        monthlyRevenue: Float!
        activeSubscriptions: Int!
        activeMemberships: Int!
        pastDueCount: Int!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        checkClassAvailability,
        getBillingStats
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        bookClass,
        checkIn,
        promoteFromWaitlist,
        kioskCheckIn,
        createMembershipWithStripe,
        createStripeSetupIntent,
        cancelMembership,
        freezeMembership,
        unfreezeMembership,
        changeMembershipTier,
        getStripeBillingPortal
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Admin",
          canCreateRecords: true,
          canManageAllRecords: true,
          canSeeOtherPeople: true,
          canEditOtherPeople: true,
          canManagePeople: true,
          canManageRoles: true,
          canAccessDashboard: true,
          canManageOnboarding: true,
          canManageSettings: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    onboardingStatus
    role {
      id
      name
      canCreateRecords
      canManageAllRecords
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canManageRoles
      canAccessDashboard
      canManageOnboarding
      canManageSettings
      isInstructor
    }
  `
});
var keystone_default = withAuth(
  (0, import_core23.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session })
    },
    session: (0, import_session.statelessSessions)(sessionConfig),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
