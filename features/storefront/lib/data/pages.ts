/** Public catalogs are read in bounded pages; `truncated` says honestly that more exist. */
export const PUBLIC_PAGE_SIZE = 100;
export const PUBLIC_MAX_PAGES = 10;

export const CATALOG_PAGE_SIZE = 48;

/**
 * One page of a public catalog after the `after` record (keyset continuation), read with one
 * extra row so `nextAfter` is set exactly when more published rows follow.
 */
export async function publicCatalogPage<T extends { id: string }>(fetchPage: (limit: number) => Promise<T[]>, pageSize = CATALOG_PAGE_SIZE) {
  const rows = await fetchPage(Math.min(pageSize + 1, PUBLIC_PAGE_SIZE));
  const items = rows.slice(0, pageSize);
  return { items, nextAfter: rows.length > pageSize ? items.at(-1)?.id ?? null : null };
}

export async function collectPublicPages<T>(fetchPage: (skip: number) => Promise<T[]>, maxItems = PUBLIC_PAGE_SIZE * PUBLIC_MAX_PAGES) {
  const items: T[] = [];
  for (let skip = 0; items.length < maxItems; skip += PUBLIC_PAGE_SIZE) {
    const page = await fetchPage(skip);
    items.push(...page);
    if (page.length < PUBLIC_PAGE_SIZE) return { items, truncated: false };
  }
  return { items: items.slice(0, maxItems), truncated: true };
}
