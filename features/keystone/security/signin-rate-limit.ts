import { GraphQLError, Kind, visit, type DocumentNode } from "graphql";
import type { Plugin } from "graphql-yoga";
import { budgetKey, consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { requestClientSource } from "../../../lib/clientSource";

const SENSITIVE_FIELDS = new Set([
  "authenticateUserWithPassword",
  "sendUserPasswordResetLink",
  "redeemUserPasswordResetToken",
]);

export const SIGN_IN_LIMIT = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** The account each sensitive field targets ('' when absent); aliases and fragments each count. */
export function sensitiveAuthenticationAccounts(document: DocumentNode, variables?: Record<string, unknown> | null) {
  const accounts: string[] = [];
  visit(document, {
    Field(node) {
      if (!SENSITIVE_FIELDS.has(node.name.value)) return;
      const email = node.arguments?.find((argument) => argument.name.value === "email")?.value;
      const value = email?.kind === Kind.STRING ? email.value : email?.kind === Kind.VARIABLE ? variables?.[email.name.value] : undefined;
      accounts.push(normalizeAuthIdentity(value) || "");
    },
  });
  return accounts;
}

/**
 * Direct GraphQL sign-in and password-reset calls are budgeted per client source AND account
 * (airline/hotel/grocery pattern): a guesser is bounded, and a stranger elsewhere never locks a
 * member out. Gym's own server calls arrive over loopback with the visitor's signed identity, so
 * each visitor keeps their own budget. Server-internal context.graphql.raw calls never pass here.
 */
export function createSignInRateLimitPlugin(prismaFor: (context: any) => any): Plugin {
  return {
    async onExecute({ args }) {
      const accounts = sensitiveAuthenticationAccounts(args.document, args.variableValues as Record<string, unknown> | null);
      if (!accounts.length) return;
      if (accounts.length > 1) {
        throw new GraphQLError("Send one sign-in or password-reset operation per request.", { extensions: { code: "BAD_USER_INPUT" } });
      }
      const context = args.contextValue as any;
      const source = requestClientSource(context?.req);
      const allowed = await consumeAuthAttempt(prismaFor(context), budgetKey("graphql-signin", accounts[0], source), SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);
      if (!allowed) {
        throw new GraphQLError("Too many sign-in attempts. Wait 15 minutes and try again.", { extensions: { code: "RATE_LIMITED" } });
      }
    },
  };
}
