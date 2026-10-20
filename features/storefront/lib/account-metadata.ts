import { cache } from "react";
import type { Metadata } from "next";
import { getUser } from "./data/user";
import { getStorefrontConfig } from "./data/gym-settings";
import { getStorefrontBrandName } from "./brand";

const currentUser = cache(getUser);

/**
 * Account routes render the sign-in slot when signed out, so the page title follows the session:
 * the section name for members, "Sign in" for visitors. Parallel-route slots do not inherit the
 * storefront title template, so the club name is added here.
 */
export async function accountMetadata(title: string): Promise<Metadata> {
  // Session first: it marks the route dynamic before any settings request is made.
  const user = await currentUser();
  const config = await getStorefrontConfig();
  return {
    title: { absolute: `${user ? title : "Sign in"} · ${getStorefrontBrandName(config)}` },
    robots: { index: false, follow: false },
  };
}
