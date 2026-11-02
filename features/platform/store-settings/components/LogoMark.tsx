'use client'

import { sanitizeGymLogoSvg } from '@/features/keystone/utils/gymLogo'
import { cn } from '@/lib/utils'
import { DEFAULT_GYM_LOGO_ICON, resolveStorefrontBrand } from '../lib/storefront-branding'
import { brandPalette } from '@/features/storefront/lib/brand-palette'

/**
 * Renders a logo exactly as the storefront does: the same sanitized mark with its paints turned
 * by the saved logo colour and, for currentColor parts, the same accessible accent shade the
 * storefront derives from it (light header vs dark surfaces).
 */
export function LogoMark({
  svg,
  logoColor,
  onDark = false,
  className,
}: {
  svg: string
  logoColor: string
  onDark?: boolean
  className?: string
}) {
  const safe = sanitizeGymLogoSvg(svg) || DEFAULT_GYM_LOGO_ICON
  const brand = resolveStorefrontBrand({ logoIcon: safe, logoColor })
  const palette = brandPalette(brand.themeHue)
  return (
    <span
      className={cn('block shrink-0 overflow-hidden [&>svg]:block [&>svg]:size-full', className)}
      style={{ color: onDark ? palette.textDark : palette.fill }}
      dangerouslySetInnerHTML={{ __html: brand.svg }}
      aria-hidden="true"
    />
  )
}
