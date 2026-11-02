import { DEFAULT_GYM_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR } from "../../../keystone/lib/storefront-branding";

/**
 * The logo onboarding writes to a new club's Store Settings, as E-commerce's onboarding does
 * with its default store logo. The merchant changes it in Store Settings; an adopted record
 * only gets a missing mark filled in, never a new colour.
 */
export const STARTER_SETTINGS_BRAND = Object.freeze({
  logoIcon: DEFAULT_GYM_LOGO_ICON,
  logoColor: DEFAULT_LIBRARY_LOGO_COLOR,
});

/** Store Settings values for a new club: the starter logo, overridden by any seeded value. */
export function starterSettingsValues<T extends Record<string, unknown>>(seedSettings: T): T & { logoIcon: string; logoColor: string } {
  return { ...STARTER_SETTINGS_BRAND, ...seedSettings } as T & { logoIcon: string; logoColor: string };
}

/** The patch for an adopted Store Settings record: only a missing mark is filled in. */
export function adoptedSettingsLogoPatch(existing: { logoIcon?: string | null }): { logoIcon: string } | null {
  return existing.logoIcon ? null : { logoIcon: STARTER_SETTINGS_BRAND.logoIcon };
}
