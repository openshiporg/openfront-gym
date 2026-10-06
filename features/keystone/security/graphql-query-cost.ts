import {
  GraphQLError,
  getArgumentValues,
  getNamedType,
  getOperationAST,
  getVariableValues,
  isCompositeType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  Kind,
  type DocumentNode,
  type GraphQLCompositeType,
  type GraphQLOutputType,
  type GraphQLSchema,
} from "graphql";
import type { Plugin } from "graphql-yoga";
import { MAX_GRAPHQL_LIST_SKIP } from "../../../lib/list-pagination";
import { MAX_GRAPHQL_LIST_TAKE } from "./graphql-limits";

/** Bounds multiplicative work along nested Keystone list selections. */
export const MAX_GRAPHQL_LIST_PATH_MULTIPLIER = MAX_GRAPHQL_LIST_TAKE;

function isListOutputType(type: GraphQLOutputType): boolean {
  let current = type;
  while (isNonNullType(current)) current = current.ofType;
  return isListType(current);
}

function fieldsFor(type: GraphQLCompositeType) {
  return isObjectType(type) || isInterfaceType(type) ? type.getFields() : undefined;
}

export function graphqlListPathMultiplierError(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string,
  variableValues: Record<string, unknown> = {},
  maxMultiplier = MAX_GRAPHQL_LIST_PATH_MULTIPLIER,
): GraphQLError | undefined {
  if (!Number.isSafeInteger(maxMultiplier) || maxMultiplier < 1) {
    throw new RangeError("GraphQL list multiplier budget must be a positive safe integer");
  }

  const operation = getOperationAST(document, operationName);
  if (!operation) return undefined;

  const rootType = operation.operation === "query"
    ? schema.getQueryType()
    : operation.operation === "mutation"
      ? schema.getMutationType()
      : schema.getSubscriptionType();
  if (!rootType) return undefined;

  const variables = getVariableValues(schema, operation.variableDefinitions ?? [], variableValues);
  if ("errors" in variables) return undefined;

  const fragments = new Map(
    document.definitions
      .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map((fragment) => [fragment.name.value, fragment]),
  );
  const limitError = () => new GraphQLError(
    `Nested GraphQL list selections exceed the maximum multiplier (${maxMultiplier})`,
  );
  const offsetError = () => new GraphQLError(
    `GraphQL list offset exceeds the maximum (${MAX_GRAPHQL_LIST_SKIP})`,
  );

  const inspect = (
    parentType: GraphQLCompositeType,
    selectionSet: NonNullable<typeof operation.selectionSet>,
    multiplier: number,
    fragmentStack: Set<string>,
  ): GraphQLError | undefined => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const field = fieldsFor(parentType)?.[selection.name.value];
        if (!field) continue;

        let childMultiplier = multiplier;
        const isListField = isListOutputType(field.type);
        if (isListField) {
          const listArguments = getArgumentValues(field, selection, variables.coerced);
          const skipArgument = field.args.find((argument) => argument.name === "skip");
          if (skipArgument) {
            const requestedSkip: unknown = listArguments.skip;
            const skip = requestedSkip == null ? 0 : requestedSkip;
            if (typeof skip !== "number" || !Number.isSafeInteger(skip) || skip < 0 || skip > MAX_GRAPHQL_LIST_SKIP) {
              return offsetError();
            }
          }

          const takeArgument = field.args.find((argument) => argument.name === "take");
          if (takeArgument) {
            const requestedTake: unknown = listArguments.take;
            const take = requestedTake == null ? MAX_GRAPHQL_LIST_TAKE : requestedTake;
            if (typeof take !== "number" || !Number.isSafeInteger(take)) return limitError();
            const effectiveTake = Math.abs(take);
            if (effectiveTake > maxMultiplier) return limitError();
            if (effectiveTake !== 0 && multiplier > Math.floor(maxMultiplier / effectiveTake)) return limitError();
            childMultiplier *= effectiveTake;
          }
        }

        if (selection.selectionSet) {
          const childType = getNamedType(field.type);
          if (isCompositeType(childType)) {
            const error = inspect(childType, selection.selectionSet, childMultiplier, fragmentStack);
            if (error) return error;
          }
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const type = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parentType;
        if (type && isCompositeType(type)) {
          const error = inspect(type, selection.selectionSet, multiplier, fragmentStack);
          if (error) return error;
        }
      } else if (!fragmentStack.has(selection.name.value)) {
        const fragment = fragments.get(selection.name.value);
        const type = fragment && schema.getType(fragment.typeCondition.name.value);
        if (fragment && type && isCompositeType(type)) {
          const nextStack = new Set(fragmentStack);
          nextStack.add(selection.name.value);
          const error = inspect(type, fragment.selectionSet, multiplier, nextStack);
          if (error) return error;
        }
      }
    }
    return undefined;
  };

  return inspect(rootType, operation.selectionSet, 1, new Set());
}

export const graphqlListPathMultiplierPlugin: Plugin = {
  onExecute({ args, setResultAndStopExecution }) {
    const error = graphqlListPathMultiplierError(
      args.schema,
      args.document,
      args.operationName,
      args.variableValues ?? {},
    );
    if (error) setResultAndStopExecution({ errors: [error] });
  },
};
