import { Kind, parse, type SelectionSetNode, type ValueNode } from "graphql";
import { normalizeAuthIdentity } from "./authRateLimit";

const AUTH_FIELDS = new Set([
  "authenticateUserWithPassword",
  "sendUserPasswordResetLink",
  "redeemUserPasswordResetToken",
  "createInitialUser",
  "registerMember",
]);

type GraphQLPayload = {
  query?: unknown;
  variables?: unknown;
};

export type GraphQLAuthInspection = {
  isAuth: boolean;
  identities: string[];
  authRootCount: number;
};

export function parseGraphQLMultipartOperations(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function readGraphQLRequestPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) return request.clone().json();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.clone().formData();
    return parseGraphQLMultipartOperations(form.get("operations"));
  }
  if (contentType.includes("application/graphql")) {
    return { query: await request.clone().text() };
  }
  return null;
}

function valueFromNode(node: ValueNode, variables: Record<string, unknown>): unknown {
  switch (node.kind) {
    case Kind.VARIABLE:
      return variables[node.name.value];
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((value) => valueFromNode(value, variables));
    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [field.name.value, valueFromNode(field.value, variables)]),
      );
  }
}

function inspectOne(payload: GraphQLPayload): GraphQLAuthInspection {
  if (typeof payload.query !== "string") return { isAuth: false, identities: [], authRootCount: 0 };
  const variables = payload.variables && typeof payload.variables === "object" && !Array.isArray(payload.variables)
    ? payload.variables as Record<string, unknown>
    : {};

  try {
    const document = parse(payload.query);
    const fragments = new Map(
      document.definitions
        .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
        .map((definition) => [definition.name.value, definition]),
    );
    const identities = new Set<string>();
    let authRootCount = 0;

    function inspectRootSelections(selectionSet: SelectionSetNode, activeFragments = new Set<string>()) {
      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.INLINE_FRAGMENT) {
          inspectRootSelections(selection.selectionSet, activeFragments);
          continue;
        }
        if (selection.kind === Kind.FRAGMENT_SPREAD) {
          const name = selection.name.value;
          const fragment = fragments.get(name);
          if (!fragment || activeFragments.has(name)) continue;
          const nextActive = new Set(activeFragments);
          nextActive.add(name);
          inspectRootSelections(fragment.selectionSet, nextActive);
          continue;
        }
        // Generated credential operations are mutation-root fields. Never count a
        // same-named nested field, and count every aliased root occurrence.
        if (!AUTH_FIELDS.has(selection.name.value)) continue;

        authRootCount += 1;
        const directEmail = selection.arguments?.find((argument) => argument.name.value === "email");
        const data = selection.arguments?.find((argument) => argument.name.value === "data");
        const directValue = directEmail ? valueFromNode(directEmail.value, variables) : undefined;
        const dataValue = data ? valueFromNode(data.value, variables) : undefined;
        const candidate = typeof directValue === "string"
          ? directValue
          : dataValue && typeof dataValue === "object" && "email" in dataValue
            ? (dataValue as { email?: unknown }).email
            : undefined;
        if (typeof candidate === "string") {
          const identity = normalizeAuthIdentity(candidate);
          if (identity) identities.add(identity);
        }
      }
    }

    for (const definition of document.definitions) {
      if (definition.kind === Kind.OPERATION_DEFINITION) {
        inspectRootSelections(definition.selectionSet);
      }
    }

    return { isAuth: authRootCount > 0, identities: [...identities], authRootCount };
  } catch {
    return { isAuth: false, identities: [], authRootCount: 0 };
  }
}

export function inspectGraphQLAuthPayload(payload: unknown): GraphQLAuthInspection {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const identities = new Set<string>();
  let authRootCount = 0;

  for (const item of payloads) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const inspection = inspectOne(item as GraphQLPayload);
    authRootCount += inspection.authRootCount;
    for (const identity of inspection.identities) identities.add(identity);
  }

  return { isAuth: authRootCount > 0, identities: [...identities], authRootCount };
}
