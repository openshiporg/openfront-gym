import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import { extendGraphqlSchema } from "./mutations";
import { mailDeliveryEnabled, sendPasswordResetEmail } from "./lib/mail";
import { permissions } from "./access";
import { withGraphqlListMaxTake } from "./security/graphql-limits";

const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
const strictConfig = (!isNextBuild && process.env.NODE_ENV === "production") || process.env.GYM_STRICT_CONFIG === "true";

// Dashboard self-signup is unsupported for Gym. The request boundary already refuses it
// (generic createUser needs people-management permission), so a wrong flag is reported
// instead of preventing every other part of the app from starting.
if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
  console.error("PUBLIC_SIGNUPS_ALLOWED=true is not supported for Gym; dashboard signup stays refused. Set it to false.");
}

// Synthetic payments can never run in production.
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

const DEVELOPMENT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/openfront_gym_dev";
if (strictConfig && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured in strict mode.");
}
const databaseURL = process.env.DATABASE_URL || DEVELOPMENT_DATABASE_URL;
if (!/^postgres(ql)?:\/\//.test(databaseURL)) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL (postgresql://…).");
}

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: requiredSecret("SESSION_SECRET") || "local-only-session-secret-for-tests",
};

/**
 * Optional capabilities (payments, mail, kiosk, partner discovery, member QR codes) are
 * validated when they are switched on and used; a missing or incomplete one is reported and
 * stays unavailable, but never stops the dashboard and storefront from starting.
 */
function capabilityWarnings() {
  const warnings: string[] = [];
  const missing = (name: string, min = 1) => !process.env[name] || process.env[name]!.trim().length < min;
  for (const flag of ["STRIPE_ENABLED", "MAIL_ENABLED"]) {
    const value = process.env[flag]?.trim().toLowerCase();
    if (value !== undefined && value !== "true" && value !== "false") warnings.push(`${flag} must be true or false; treating it as false`);
  }
  if (process.env.STRIPE_ENABLED === "true" && (missing("STRIPE_SECRET_KEY", 32) || missing("STRIPE_WEBHOOK_SECRET", 32))) warnings.push("Stripe is enabled without STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; card payments are unavailable");
  if (process.env.MAIL_ENABLED === "true" && (missing("SMTP_HOST") || missing("SMTP_FROM"))) warnings.push("Mail is enabled without SMTP_HOST and SMTP_FROM; email is unavailable");
  if ((process.env.STRIPE_ENABLED === "true" || process.env.MAIL_ENABLED === "true") && missing("NEXTAUTH_URL")) warnings.push("NEXTAUTH_URL (the public site origin) is required for payment returns and email links");
  if ((process.env.KIOSK_API_TOKEN || process.env.KIOSK_ORGANIZATION_ID) && (missing("KIOSK_API_TOKEN", 32) || missing("KIOSK_ORGANIZATION_ID"))) warnings.push("Kiosk needs both KIOSK_API_TOKEN (32+ characters) and KIOSK_ORGANIZATION_ID; kiosk is unavailable");
  if ((process.env.DISCOVERY_API_KEY || process.env.DISCOVERY_ORGANIZATION_ID || process.env.DISCOVERY_API_SCOPES) && (missing("DISCOVERY_API_KEY", 32) || missing("DISCOVERY_ORGANIZATION_ID") || missing("DISCOVERY_API_SCOPES"))) warnings.push("Partner discovery is partly configured; it stays unavailable");
  if (missing("QR_CODE_SECRET", 32)) warnings.push("QR_CODE_SECRET is not set; member check-in codes are unavailable");
  if (process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true" && (missing("PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID") || missing("STOREFRONT_ORGANIZATION_ID"))) warnings.push("Public member signup needs PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID and STOREFRONT_ORGANIZATION_ID; signup is unavailable");
  return warnings;
}
if (strictConfig) for (const warning of capabilityWarnings()) console.warn(`[gym config] ${warning}`);

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
    tokensValidForMins: 60,
    async sendToken(args) {
      // The link goes only to the holder's own mailbox. A member account keeps its storefront
      // channel (even when it also has dashboard access); staff-only accounts reset in the dashboard.
      // Failures never surface to the caller, so the public reply cannot reveal whether an account
      // exists; they are logged without identity or token.
      try {
        const user = await args.context.sudo().query.User.findOne({ where: { id: String(args.itemId) }, query: "id organization { id } role { canAccessDashboard }" });
        const members = user ? await args.context.sudo().query.Member.count({ where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization?.id ?? "" } } }] } }) : 0;
        if (!mailDeliveryEnabled()) return;
        const outcome = await sendPasswordResetEmail(args.token, args.identity, { storefront: members > 0, dashboard: Boolean(user?.role?.canAccessDashboard) });
        if (outcome !== "accepted") console.warn(`Password link mail ${outcome} by the mail server`);
      } catch {
        console.warn("Password link mail could not be sent");
      }
    },
  },
  sessionData: `
    name
    email
    onboardingStatus
    organization {
      id
      name
      status
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
      canManageCheckIns
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
    lists: withGraphqlListMaxTake(models),
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