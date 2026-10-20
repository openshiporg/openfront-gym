import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { resolveStorefrontBrand } from "@/features/keystone/lib/storefront-branding";

export type WordmarkBrand = { name: string; tagline?: string | null; logoIcon?: string | null; logoColor?: string | null };

/** Header, mobile menu and footer all build the lockup from published settings the same way. */
export function wordmarkBrand(
  config?: { name?: string | null; tagline?: string | null; logoIcon?: string | null; logoColor?: string | null } | null
): WordmarkBrand {
  return {
    name: getStorefrontBrandName(config),
    tagline: config?.tagline ?? null,
    logoIcon: config?.logoIcon ?? null,
    logoColor: config?.logoColor ?? null,
  };
}

/**
 * The single storefront brand lockup. `logoIcon` arrives already sanitized by
 * publicGymSettings; a tenant that never chose a logo gets the library default,
 * and the saved logo color turns the mark's own paints (currentColor parts take the accent).
 */
export default function Wordmark({ brand, onNavigate }: { brand: WordmarkBrand; onNavigate?: () => void }) {
  const mark = resolveStorefrontBrand(brand);
  return (
    <Link href="/" onClick={onNavigate} className="sf-wordmark" aria-label={`${brand.name} home`}>
      <span
        className="sf-wordmark-mark"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: mark.svg }}
      />
      <span className="sf-wordmark-copy">
        <strong>{brand.name}</strong>
        {brand.tagline ? <span>{brand.tagline}</span> : null}
      </span>
    </Link>
  );
}
