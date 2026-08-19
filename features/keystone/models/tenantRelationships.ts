type TenantRelationshipTarget = {
  field: string;
  list: string;
  required?: boolean;
};

export function requiredRelationshipDb(relationName: string) {
  return (field: string) => field
    .replace(new RegExp(`(${relationName}\\s+\\w+)\\?`), "$1")
    .replace(new RegExp(`(${relationName}Id\\s+String)\\?`), "$1");
}

export function compoundUniqueDb(...constraints: string[]) {
  return (schema: string) => {
    const additions = constraints
      .map((constraint) => `  @@unique([${constraint}])`)
      .join("\n");
    return schema.replace(/\n}/, `\n${additions}\n}`);
  };
}

export function connectedRelationshipId(value: unknown): string | null | undefined {
  if (!value || typeof value !== "object") return undefined;
  const relationship = value as {
    connect?: { id?: unknown };
    disconnect?: boolean;
  };
  if (relationship.disconnect) return null;
  return typeof relationship.connect?.id === "string" ? relationship.connect.id : undefined;
}

export function tenantOrganizationId(resolvedData: any, item: any): string | null | undefined {
  const connected = connectedRelationshipId(resolvedData.organization);
  if (connected !== undefined) return connected;
  return item?.organizationId ?? undefined;
}

export function validateTenantOwnership(
  targets: readonly TenantRelationshipTarget[],
  options: { requireOrganization?: boolean } = {},
) {
  return async function validateTenantOwnershipInput({
    resolvedData,
    item,
    context,
    addValidationError,
    session,
    operation,
  }: any) {
    const sessionOrganizationId = argsSessionOrganizationId({ session, context });
    const requireOrganization = options.requireOrganization ?? true;
    if (operation === "create" && resolvedData.organization === undefined && sessionOrganizationId) {
      resolvedData.organization = { connect: { id: sessionOrganizationId } };
    } else if (operation === "create" && resolvedData.organization === undefined && !requireOrganization) {
      const [defaultOrganization] = await context.sudo().query.Organization.findMany({
        take: 1,
        orderBy: [{ createdAt: "asc" }],
        query: "id",
      });
      if (defaultOrganization?.id) {
        resolvedData.organization = { connect: { id: defaultOrganization.id } };
      }
    }
    const organizationId = tenantOrganizationId(resolvedData, item);

    if (!organizationId && requireOrganization) {
      addValidationError("A tenant organization is required");
      return;
    }
    if (!organizationId) return;

    if (sessionOrganizationId && sessionOrganizationId !== organizationId) {
      addValidationError("The relationship must belong to the signed-in organization");
      return;
    }

    if (resolvedData.organization !== undefined) {
      const connectedOrganizationId = connectedRelationshipId(resolvedData.organization);
      if (connectedOrganizationId !== organizationId) {
        addValidationError("The tenant organization cannot be reassigned");
        return;
      }
    }

    for (const target of targets) {
      const relationshipValue = resolvedData[target.field];
      const relationshipId = relationshipValue === undefined
        ? item?.[`${target.field}Id`]
        : connectedRelationshipId(relationshipValue);

      if (!relationshipId) {
        if (target.required) addValidationError(`${target.field} is required`);
        continue;
      }

      const related = await context.prisma[target.list].findUnique({
        where: { id: relationshipId },
        select: { id: true, organizationId: true },
      });
      if (!related) {
        addValidationError(`${target.field} was not found`);
      } else if (related.organizationId !== organizationId) {
        addValidationError(`${target.field} must belong to the same organization`);
      }
    }
  };
}

function argsSessionOrganizationId(args: any): string | null {
  const id = (args?.session ?? args?.context?.session)?.data?.organization?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function validateResourceLocation({
  resolvedData,
  item,
  context,
  addValidationError,
}: any) {
  const locationId = resolvedData.location === undefined
    ? item?.locationId
    : connectedRelationshipId(resolvedData.location);
  const resourceId = resolvedData.resource === undefined
    ? item?.resourceId
    : connectedRelationshipId(resolvedData.resource);
  if (!locationId || !resourceId) return;

  const resource = await context.prisma.gymResource.findUnique({
    where: { id: resourceId },
    select: { locationId: true },
  });
  if (resource && resource.locationId !== locationId) {
    addValidationError("resource must belong to the selected location");
  }
}
