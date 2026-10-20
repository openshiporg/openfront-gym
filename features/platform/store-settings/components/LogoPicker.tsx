'use client'

import { useId, useMemo, useState } from 'react'
import { CheckCircle2, Code2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldTextarea } from '@/features/platform/components/platform-ui'
import { explainGymLogoSvgRejection, sanitizeGymLogoSvg } from '@/features/keystone/utils/gymLogo'
import { cn } from '@/lib/utils'
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry'
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

interface LogoPickerProps {
  /** Saved SVG; empty means the tenant never chose one and the Boltshift default renders. */
  value: string
  hue: string
  onChange: (svg: string) => void
}

export function LogoPicker({ value, hue, onChange }: LogoPickerProps) {
  const editorId = useId()
  const effective = value || DEFAULT_GYM_LOGO_ICON
  const selectedIcon = useMemo(() => LOGO_ICONS.find((icon) => icon.lightSvg === effective), [effective])
  const [isEditingCustom, setIsEditingCustom] = useState(!selectedIcon)
  const [draft, setDraft] = useState(effective)
  const safeDraft = useMemo(() => sanitizeGymLogoSvg(draft), [draft])
  const rejection = useMemo(() => (draft.trim() ? explainGymLogoSvgRejection(draft) : null), [draft])
  const hasValidDraft = safeDraft.length > 0
  const hasDraftChanges = safeDraft !== value

  const selectLogo = (id: string) => {
    if (id === 'custom') {
      setDraft(effective)
      setIsEditingCustom(true)
      return
    }
    const icon = LOGO_ICONS.find((candidate) => candidate.id === id)
    if (!icon) return
    onChange(icon.lightSvg)
    setDraft(icon.lightSvg)
    setIsEditingCustom(false)
  }

  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-lg border bg-muted/40 p-2.5">
          <LogoMark svg={effective} logoColor={hue} className="size-full" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <Select value={selectedIcon?.id ?? 'custom'} onValueChange={selectLogo}>
            <SelectTrigger className="h-9 w-full min-w-0 text-sm" aria-label="Logo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[260px]">
              <SelectItem value="custom">
                <span className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-md border border-dashed bg-muted/30">
                    <Code2 className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="font-medium">Custom SVG</span>
                </span>
              </SelectItem>
              {LOGO_ICONS.map((icon) => (
                <SelectItem key={icon.id} value={icon.id}>
                  <span className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-md border bg-background p-1">
                      <LogoMark svg={icon.lightSvg} logoColor={hue} className="size-full" />
                    </span>
                    <span className="font-medium">{icon.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setDraft(effective)
                setIsEditingCustom((open) => !open)
              }}
              aria-expanded={isEditingCustom}
              aria-controls={editorId}
            >
              <Code2 className="mr-1.5 size-3.5" aria-hidden />
              {selectedIcon ? 'Edit as SVG' : 'Custom SVG'}
            </Button>
            {!value ? (
              <span className="text-[11px] text-muted-foreground">Default mark · not saved yet</span>
            ) : !selectedIcon ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden /> Custom logo
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {isEditingCustom ? (
        <div id={editorId} className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor={`${editorId}-source`} className="text-xs font-medium">Custom SVG</label>
              <p className="mt-0.5 text-pretty text-[11px] leading-4 text-muted-foreground">
                Paste a complete SVG. Scripts, links, images, styles, event handlers and external references are rejected; gradients and viewBox are kept.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setIsEditingCustom(false)}
              aria-label="Close custom SVG editor"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>

          <FieldTextarea
            id={`${editorId}-source`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-3 min-h-32 resize-y font-mono text-[11px] leading-4"
            placeholder='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">…</svg>'
            spellCheck={false}
            aria-invalid={rejection ? true : undefined}
            aria-describedby={`${editorId}-status`}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-md border bg-background p-1.5">
                {hasValidDraft ? (
                  <LogoMark svg={safeDraft} logoColor={hue} className="size-full" />
                ) : (
                  <X className="size-4 text-muted-foreground" aria-hidden />
                )}
              </span>
              <p
                id={`${editorId}-status`}
                role="status"
                className={cn('min-w-0 text-pretty text-[11px] leading-4', rejection ? 'text-destructive' : 'text-muted-foreground')}
              >
                {rejection ?? (hasValidDraft ? (hasDraftChanges ? 'Safe preview. Apply, then save changes to publish.' : 'This is the current logo.') : 'Paste an SVG to preview it.')}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-3 text-xs"
              disabled={!hasValidDraft || !hasDraftChanges}
              onClick={() => {
                onChange(safeDraft)
                setIsEditingCustom(false)
              }}
            >
              Apply SVG
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Saved logo color: donor hue presets plus a fine-grained rotation slider. */
export function LogoColorField({
  value,
  svg,
  onChange,
}: {
  value: string
  svg: string
  onChange: (value: string) => void
}) {
  const labelId = useId()
  const degrees = Math.round(Number(value) || 0)
  return (
    <div className="grid content-start gap-1.5">
      <span id={labelId} className="text-xs font-medium">Logo color</span>
      <div className="rounded-lg border bg-background p-3">
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {HUE_PRESETS.map((preset) => {
            const active = degrees === preset.value
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChange(String(preset.value))}
                aria-pressed={active}
                aria-label={`${preset.name} logo color`}
                title={preset.name}
                className={cn(
                  'grid size-8 place-items-center rounded-md border bg-background p-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'border-foreground ring-1 ring-foreground'
                )}
              >
                <LogoMark svg={svg} logoColor={String(preset.value)} className="size-full" />
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            aria-label="Logo hue rotation"
            type="range"
            min="0"
            max="359"
            step="1"
            value={degrees}
            onChange={(event) => onChange(event.target.value)}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-foreground"
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{degrees}°</span>
        </div>
      </div>
      <p className="text-pretty text-xs leading-5 text-muted-foreground">Sets the logo color and the storefront accent: buttons, links and highlights use an accessible shade of it.</p>
    </div>
  )
}
