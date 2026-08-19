export const UNCONFIGURED_STOREFRONT = {
  name: "Gym storefront",
  description: "This storefront has not been configured yet.",
} as const;

export function getStorefrontBrandName(config?: { name?: string | null } | null) {
  return config?.name?.trim() || UNCONFIGURED_STOREFRONT.name;
}
