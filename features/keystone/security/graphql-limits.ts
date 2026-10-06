import { GraphQLError, Kind, type ValidationRule } from "graphql";
import type { Plugin } from "graphql-yoga";
import { MAX_GRAPHQL_LIST_TAKE } from "../../../lib/list-pagination";

/** Keep list bounds aligned with the E-commerce Keystone configuration. */
export { MAX_GRAPHQL_LIST_TAKE };
export const MAX_GRAPHQL_PARSE_TOKENS = 20_000;
export const MAX_GRAPHQL_SELECTION_DEPTH = 24;
export const MAX_GRAPHQL_FIELD_COUNT = 3000;
export const MAX_GRAPHQL_ALIAS_COUNT = 500;

export function withGraphqlListMaxTake(models: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(models).map(([key, value]) => {
    const configuredMaxTake = (value as any).graphql?.maxTake;
    if (configuredMaxTake !== undefined && (!Number.isSafeInteger(configuredMaxTake) || configuredMaxTake < 1)) {
      throw new RangeError(`${key}.graphql.maxTake must be a positive safe integer`);
    }
    return [key, {
      ...value,
      graphql: {
        ...(value as any).graphql,
        maxTake: Math.min(configuredMaxTake ?? MAX_GRAPHQL_LIST_TAKE, MAX_GRAPHQL_LIST_TAKE),
      },
    }];
  }));
}

/** Count expanded fragments so aliases and fragment spreads cannot hide query work. */
export const gymGraphqlQueryLimits: ValidationRule = (context) => ({
  Document(document) {
    const fragments = new Map(
      document.definitions
        .filter((node) => node.kind === Kind.FRAGMENT_DEFINITION)
        .map((node) => [node.name.value, node]),
    );

    let limitError: GraphQLError | undefined;
    for (const definition of document.definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;

      let fields = 0;
      let aliases = 0;
      const inspect = (
        selectionSet: typeof definition.selectionSet,
        depth: number,
        wrapperDepth: number,
        fragmentStack: Set<string>,
      ) => {
        if (depth > MAX_GRAPHQL_SELECTION_DEPTH || wrapperDepth > MAX_GRAPHQL_SELECTION_DEPTH) {
          limitError = new GraphQLError(`Query exceeds maximum selection depth (${MAX_GRAPHQL_SELECTION_DEPTH})`);
          return;
        }

        for (const node of selectionSet.selections) {
          if (node.kind === Kind.FIELD) {
            const fieldDepth = depth + 1;
            if (fieldDepth > MAX_GRAPHQL_SELECTION_DEPTH) {
              limitError = new GraphQLError(`Query exceeds maximum selection depth (${MAX_GRAPHQL_SELECTION_DEPTH})`);
              return;
            }
            fields += 1;
            if (fields > MAX_GRAPHQL_FIELD_COUNT) {
              limitError = new GraphQLError(`Query exceeds maximum field count (${MAX_GRAPHQL_FIELD_COUNT})`);
              return;
            }
            if (node.alias && ++aliases > MAX_GRAPHQL_ALIAS_COUNT) {
              limitError = new GraphQLError(`Query exceeds maximum alias count (${MAX_GRAPHQL_ALIAS_COUNT})`);
              return;
            }
            if (node.selectionSet) inspect(node.selectionSet, fieldDepth, 0, fragmentStack);
          } else if (node.kind === Kind.INLINE_FRAGMENT) {
            inspect(node.selectionSet, depth, wrapperDepth + 1, fragmentStack);
          } else {
            if (fragmentStack.has(node.name.value)) {
              limitError = new GraphQLError("Cyclic fragments are not supported");
              return;
            }
            const fragment = fragments.get(node.name.value);
            if (fragment) {
              const nextStack = new Set(fragmentStack);
              nextStack.add(node.name.value);
              inspect(fragment.selectionSet, depth, wrapperDepth + 1, nextStack);
            }
          }
          if (limitError) return;
        }
      };

      inspect(definition.selectionSet, 0, 0, new Set());
      if (limitError) break;
    }

    if (limitError) context.reportError(limitError);
  },
});

export const gymGraphqlAdmissionPlugin: Plugin = {
  onParse({ parseFn, setParseFn }) {
    setParseFn((source, options) => parseFn(source, { ...options, maxTokens: MAX_GRAPHQL_PARSE_TOKENS }));
  },
  onValidate({ addValidationRule }) {
    addValidationRule(gymGraphqlQueryLimits);
  },
};
