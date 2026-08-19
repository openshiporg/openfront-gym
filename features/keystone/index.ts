import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { permissions } from "./access";

const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
const strictConfig = (!isNextBuild && process.env.NODE_ENV === "production") || process.env.GYM_STRICT_CONFIG === "true";

if (strictConfig && process.env.PAYMENT_TEST_MODE === "true") {
  throw new Error("PAYMENT_TEST_MODE must be disabled in strict/production mode.");
}

function requiredSecret(name: string) {
  const value = process.env[name];
  if (strictConfig && (!value || value.length < 32)) {
    throw new Error(`${name} must be configured with at least 32 characters in strict mode.`);
  }
  return value;
}

function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (strictConfig && !value) throw new Error(`${name} must be configured in strict mode.`);
  return value;
}

function requiredUrl(name: string) {
  const value = requiredValue(name);
  if (strictConfig && value) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`${name} must use http or https.`);
    }
  }
  return value;
}

function explicitCapability(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (strictConfig && value !== "true" && value !== "false") {
    throw new Error(`${name} must be explicitly true or false in strict mode.`);
  }
  return value === "true";
}

const databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
if (strictConfig && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured in strict mode.");
}

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: requiredSecret("SESSION_SECRET") || "local-only-session-secret-for-tests",
};
if (strictConfig) {
  const stripeEnabled = explicitCapability("STRIPE_ENABLED");
  const mailEnabled = explicitCapability("MAIL_ENABLED");
  if (stripeEnabled) {
    requiredSecret("STRIPE_SECRET_KEY");
    requiredSecret("STRIPE_WEBHOOK_SECRET");
  }
  requiredSecret("QR_CODE_SECRET");
  requiredUrl("NEXTAUTH_URL");
  if (mailEnabled) {
    requiredValue("SMTP_HOST");
    requiredValue("SMTP_PORT");
    requiredValue("SMTP_USER");
    requiredValue("SMTP_PASSWORD");
    requiredValue("SMTP_FROM");
    requiredUrl("SMTP_STORE_LINK");
  }
  if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
    requiredValue("PUBLIC_SIGNUP_ORGANIZATION_ID");
    requiredValue("STOREFRONT_ORGANIZATION_ID");
  }
  const kioskConfigured = Boolean(process.env.KIOSK_API_TOKEN || process.env.KIOSK_ORGANIZATION_ID);
  if (kioskConfigured) {
    requiredSecret("KIOSK_API_TOKEN");
    requiredValue("KIOSK_ORGANIZATION_ID");
  }
  const discoveryConfigured = Boolean(
    process.env.DISCOVERY_API_KEY ||
    process.env.DISCOVERY_ORGANIZATION_ID ||
    process.env.DISCOVERY_API_SCOPES,
  );
  if (discoveryConfigured) {
    requiredSecret("DISCOVERY_API_KEY");
    requiredValue("DISCOVERY_ORGANIZATION_ID");
    requiredValue("DISCOVERY_API_SCOPES");
  }
}

const bucketName = process.env.S3_BUCKET_NAME || (strictConfig ? "" : "keystone-test");
const region = process.env.S3_REGION || (strictConfig ? "" : "ap-southeast-2");
const accessKeyId = process.env.S3_ACCESS_KEY_ID || (strictConfig ? "" : "keystone");
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || (strictConfig ? "" : "keystone");
const endpoint = process.env.S3_ENDPOINT || (strictConfig ? "" : "https://sfo3.digitaloceanspaces.com");
if (strictConfig && (!bucketName || !region || !accessKeyId || !secretAccessKey || !endpoint)) {
  throw new Error("S3 storage configuration is incomplete in strict mode.");
}

const { withAuth } = createAuth({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      // The tenant-ownership migration always creates this deterministic
      // bootstrap organization before the first account can be initialized.
      organization: {
        connect: { id: "gym_default_organization" },
      },
      role: {
        create: {
          organization: { connect: { id: "gym_default_organization" } },
          name: "Admin",
          canCreateRecords: true,
          canManageAllRecords: true,
          canSeeOtherPeople: true,
          canEditOtherPeople: true,
          canManagePeople: true,
          canManageRoles: true,
          canAccessDashboard: true,
          canManageOnboarding: true,
          canManageSettings: true,
          canManageAppointments: true,
          canManageFacilities: true,
          canManagePrograms: true,
          canManageCommunications: true,
          canManageRetail: true,
          canManagePayroll: true,
          canViewReports: true,
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      // send the email
      await sendPasswordResetEmail(args.token, args.identity);
    },
  },
  sessionData: `
    name
    email
    onboardingStatus
    organization {
      id
      name
    }
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
      canManageAppointments
      canManageFacilities
      canManagePrograms
      canManageCommunications
      canManageRetail
      canManagePayroll
      canViewReports
      isInstructor
    }
  `
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
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
        signed: { expiry: 5000 },
        forcePathStyle: true,
      },
    },
    ui: {
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session }),
    },
    session: statelessSessions(sessionConfig),
    graphql: {
      extendGraphqlSchema,
    },
  })
);