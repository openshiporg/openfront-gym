import type { GraphQLError } from "graphql";
import { maskError as maskYogaError, type YogaMaskedErrorOpts } from "graphql-yoga";

// Server detail that must stay masked even when a resolver throws it as a plain Error.
const ENV_NAME = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;
const INTERNAL_DETAIL = /prisma|graphql error result|malformed|econn|enotfound|\bP\d{4}\b|\n/i;

function isResolverMessage(error: unknown): error is GraphQLError {
  const original = (error as GraphQLError | null)?.originalError;
  return (
    Boolean(original) &&
    Object.getPrototypeOf(original) === Error.prototype &&
    !("code" in (original as object)) &&
    original!.message.length <= 300 &&
    !ENV_NAME.test(original!.message) &&
    !INTERNAL_DETAIL.test(original!.message)
  );
}

/**
 * Yoga masks every non-GraphQLError in production. Gym resolvers report rule failures
 * ("An account with that email already exists", "This class is full") as plain Errors, and the
 * storefront and dashboard map those messages, so they pass through. Library and system errors
 * (Prisma, Stripe, network) are subclasses or carry a code, and stay masked.
 */
export const gymMaskedErrors: Partial<YogaMaskedErrorOpts> = {
  maskError: (error, message, isDev) => (isResolverMessage(error) ? error : maskYogaError(error, message, isDev)),
};
