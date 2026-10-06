export const MAX_GRAPHQL_LIST_TAKE = 5001;
export const MAX_GRAPHQL_LIST_SKIP = 1_000_000;
export const DEFAULT_DASHBOARD_PAGE_SIZE = 50;

function parseNonNegativeSafeInteger(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function normalizeListPageSize(value: unknown, fallback = DEFAULT_DASHBOARD_PAGE_SIZE): number {
  const parsedFallback = parseNonNegativeSafeInteger(fallback);
  const safeFallback = Math.min(Math.max(parsedFallback ?? DEFAULT_DASHBOARD_PAGE_SIZE, 1), MAX_GRAPHQL_LIST_TAKE);
  const parsedValue = parseNonNegativeSafeInteger(value);
  return Math.min(Math.max(parsedValue ?? safeFallback, 1), MAX_GRAPHQL_LIST_TAKE);
}

export function normalizeListOffset(value: unknown): number {
  return Math.min(parseNonNegativeSafeInteger(value) ?? 0, MAX_GRAPHQL_LIST_SKIP);
}

export function normalizeDashboardListPagination(
  pageValue: unknown,
  pageSizeValue: unknown,
  defaultPageSize: unknown = DEFAULT_DASHBOARD_PAGE_SIZE,
) {
  const pageSize = normalizeListPageSize(pageSizeValue, normalizeListPageSize(defaultPageSize));
  const maximumPage = Math.floor(MAX_GRAPHQL_LIST_SKIP / pageSize) + 1;
  const requestedPage = parseNonNegativeSafeInteger(pageValue) ?? 1;
  const page = Math.min(Math.max(requestedPage, 1), maximumPage);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function normalizeDashboardListWindow(
  take: unknown,
  skip: unknown,
  defaultPageSize: unknown = DEFAULT_DASHBOARD_PAGE_SIZE,
) {
  return {
    take: normalizeListPageSize(take, normalizeListPageSize(defaultPageSize)),
    skip: normalizeListOffset(skip),
  };
}
