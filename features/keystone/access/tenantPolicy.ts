type TenantSession = {
  itemId: string;
  data?: {
    organization?: { id?: string } | null;
    role?: { canManageAllRecords?: boolean } | null;
  };
};

type TenantAccessArgs = {
  session?: TenantSession | null;
  item?: { organizationId?: string | null; organization?: { id?: string } | null } | null;
};

export function getTenantId(session?: TenantSession | null): string | null {
  const id = session?.data?.organization?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function tenantFilter(
  { session }: TenantAccessArgs,
  narrowerFilter?: Record<string, unknown>
): false | Record<string, unknown> {
  const organizationId = getTenantId(session);
  if (!organizationId) return false;
  const organizationFilter = { organization: { id: { equals: organizationId } } };
  if (!narrowerFilter) return organizationFilter;
  return { AND: [organizationFilter, narrowerFilter] };
}

export function tenantItemAccess({ session, item }: TenantAccessArgs): boolean {
  const organizationId = getTenantId(session);
  if (!organizationId || !item) return false;
  const itemOrganizationId = item.organizationId ?? item.organization?.id;
  return itemOrganizationId === organizationId;
}

export function canManageTenant(
  { session }: TenantAccessArgs,
  permission?: keyof NonNullable<TenantSession["data"]>["role"]
): boolean {
  if (!getTenantId(session)) return false;
  if (session?.data?.role?.canManageAllRecords) return true;
  return permission ? Boolean(session?.data?.role?.[permission]) : false;
}
