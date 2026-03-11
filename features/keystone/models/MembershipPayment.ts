import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  relationship,
  select,
  timestamp,
  float,
  text,
  checkbox,
} from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const MembershipPayment = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["member", "amount", "status", "paymentDate", "paymentType"],
    },
  },
  fields: {
    member: relationship({
      ref: "User.payments",
      ui: {
        displayMode: "select",
      },
    }),

    membership: relationship({
      ref: "Membership.payments",
      ui: {
        displayMode: "select",
        description: "Associated membership (if applicable)",
      },
    }),

    amount: float({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in dollars",
      },
    }),

    paymentType: select({
      type: "string",
      options: [
        { label: "Membership", value: "membership" },
        { label: "Class Pack", value: "class-pack" },
        { label: "Personal Training", value: "personal-training" },
        { label: "Day Pass", value: "day-pass" },
        { label: "Late Cancel Fee", value: "late-cancel-fee" },
        { label: "Initiation Fee", value: "initiation-fee" },
        { label: "Freeze Fee", value: "freeze-fee" },
        { label: "Other", value: "other" },
      ],
      defaultValue: "membership",
      validation: { isRequired: true },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" },
        { label: "Disputed", value: "disputed" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
    }),

    paymentDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
    }),

    paymentMethod: select({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit-card" },
        { label: "Debit Card", value: "debit-card" },
        { label: "ACH/Bank Transfer", value: "ach" },
        { label: "Cash", value: "cash" },
        { label: "Check", value: "check" },
      ],
      defaultValue: "credit-card",
    }),

    // Stripe-specific fields
    stripePaymentIntentId: text({
      ui: {
        description: "Stripe Payment Intent ID",
      },
    }),

    stripeChargeId: text({
      ui: {
        description: "Stripe Charge ID",
      },
    }),

    stripeInvoiceId: text({
      ui: {
        description: "Stripe Invoice ID (for subscriptions)",
      },
    }),

    // Receipt information
    receiptNumber: text({
      isIndexed: true,
      ui: {
        description: "Internal receipt number",
      },
    }),

    receiptUrl: text({
      ui: {
        description: "URL to the receipt (from Stripe or generated)",
      },
    }),

    // Metadata
    description: text({
      ui: {
        description: "Description of the payment (e.g., 'Monthly Premium Membership')",
      },
    }),

    notes: text({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment",
      },
    }),

    isRecurring: checkbox({
      defaultValue: false,
      ui: {
        description: "Is this part of a recurring subscription?",
      },
    }),

    refundedAt: timestamp({
      ui: {
        description: "When this payment was refunded",
      },
    }),

    refundAmount: float({
      ui: {
        description: "Amount refunded (partial or full)",
      },
    }),

    refundReason: text({
      ui: {
        description: "Reason for refund",
      },
    }),

    processedBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed this payment (for manual payments)",
      },
    }),

    ...trackingFields,
  },
});
