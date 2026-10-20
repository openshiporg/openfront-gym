'use client'

import { useState, type ReactNode } from 'react'
import { Building2, Clock, Contact, FileText, Globe2, Megaphone, Plus, Save, Sparkles, Store, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { FieldInput, FieldTextarea, FormField, Notice, Panel, PanelBody, PanelHeader } from '@/features/platform/components/platform-ui'
import { sameDraft, useUnsavedChangesWarning } from '@/features/platform/components/record-editor'
import { WeeklyHoursEditor, type DayKey, type HoursState } from '@/features/platform/store-settings/components/WeeklyHoursEditor'
import { editorWeeklyHours, parseDayHours } from '@/features/keystone/lib/gym-hours'
import { SETTINGS_LIMITS, publicCtaHref } from '@/features/keystone/lib/gym-settings-content'
import { isConfiguredPublicEmail } from '@/features/storefront/lib/contact-config'
import { loadGymSettingsEditor, publishParticipationTerms, saveGymSettings } from '../actions/store-settings'
import { LogoColorField, LogoMark, LogoPicker } from '../components/LogoPicker'
import { DEFAULT_GYM_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR, normalizeGymLogoColor } from '../lib/storefront-branding'

type Settings = Record<string, any> | null
type Policy = {
  policyId: string
  version: string
  source: 'pasted' | 'document'
  documentReference: string
  text: string
  placeholder: boolean
  acceptanceRequired: boolean
  adultOnly: boolean
  healthPurpose: string
  retentionDays: number
  publishedAt: string
} | null

export type GymSettingsEditorData = { settings: Settings; participationPolicy: Policy }

const days: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
]

const timezoneOptions = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]
const localeOptions = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT']

const TEXT_FIELDS = [
  'name', 'tagline', 'description', 'address', 'phone', 'email', 'countryCode', 'locale', 'timezone', 'promoBanner',
  'heroEyebrow', 'heroHeadline', 'heroSubheadline', 'heroImageUrl', 'heroPrimaryCtaLabel', 'heroPrimaryCtaHref',
  'heroSecondaryCtaLabel', 'heroSecondaryCtaHref', 'footerTagline', 'copyrightName', 'facilityHeadline', 'facilityDescription',
] as const
type TextField = (typeof TEXT_FIELDS)[number]

/** Saved hours exactly as the shared reader understands them; nothing is invented for missing days. */
function hoursState(raw: unknown): HoursState {
  const editor = editorWeeklyHours(raw)
  const out: any = {}
  for (const day of days) {
    const value = editor[day.key] as any
    if (!parseDayHours(value)) out[day.key] = { enabled: false, unset: true, ranges: [] }
    else if (value.enabled === false) out[day.key] = { enabled: false, ranges: [] }
    else if (value.allDay) out[day.key] = { enabled: true, allDay: true, ranges: [] }
    else out[day.key] = { enabled: true, ranges: value.ranges.map((range: any) => ({ open: range.open, close: range.close })) }
  }
  return out
}

function serializeHours(hours: HoursState) {
  return Object.fromEntries(days.map((day) => {
    const item = hours[day.key]
    if (!item.enabled) return [day.key, { enabled: false, ranges: [] }]
    if (item.allDay) return [day.key, { enabled: true, allDay: true, ranges: [] }]
    return [day.key, { enabled: true, ranges: item.ranges }]
  }))
}

type DetailBlock = { title: string; details: string[] }
type HighlightBlock = { title: string; description: string; features: string[] }

function draftFrom(settings: Settings) {
  const form = Object.fromEntries(TEXT_FIELDS.map((field) => [field, String(settings?.[field] ?? '')])) as Record<TextField, string>
  if (!form.locale) form.locale = 'en-US'
  if (!form.timezone) form.timezone = 'America/New_York'
  if (!form.countryCode) form.countryCode = 'US'
  return {
    form,
    logoIcon: String(settings?.logoIcon ?? ''),
    logoColor: settings?.logoIcon ? normalizeGymLogoColor(settings?.logoColor) : DEFAULT_LIBRARY_LOGO_COLOR,
    hours: hoursState(settings?.hours),
    contactTopics: (Array.isArray(settings?.contactTopics) ? settings!.contactTopics : []).map((item: any) => ({ title: String(item?.title ?? ''), details: Array.isArray(item?.details) ? item.details.map(String) : [] })) as DetailBlock[],
    facilityHighlights: (Array.isArray(settings?.facilityHighlights) ? settings!.facilityHighlights : []).map((item: any) => ({ title: String(item?.title ?? ''), description: String(item?.description ?? ''), features: Array.isArray(item?.features) ? item.features.map(String) : [] })) as HighlightBlock[],
  }
}

type Draft = ReturnType<typeof draftFrom>

function Section({ id, title, description, icon, actions, children }: { id: string; title: string; description?: ReactNode; icon: LucideIcon; actions?: ReactNode; children: ReactNode }) {
  return (
    <Panel id={id}>
      <PanelHeader icon={icon} title={title} description={description} actions={actions} />
      {children}
    </Panel>
  )
}

function RepeaterItem({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-rose-600" onClick={onRemove} aria-label={`Remove ${label.toLowerCase()}`}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  )
}

/**
 * Keeps edits made while a save was in flight: only fields the person has not touched since the
 * submitted snapshot take the server's saved values.
 */
function mergeAfterSave(current: Draft, submitted: Draft, saved: Draft): Draft {
  const form = { ...saved.form }
  for (const key of Object.keys(current.form) as TextField[]) {
    if (current.form[key] !== submitted.form[key]) form[key] = current.form[key]
  }
  const pick = <K extends Exclude<keyof Draft, 'form'>>(key: K): Draft[K] => (sameDraft(current[key], submitted[key]) ? saved[key] : current[key])
  return { form, logoIcon: pick('logoIcon'), logoColor: pick('logoColor'), hours: pick('hours'), contactTopics: pick('contactTopics'), facilityHighlights: pick('facilityHighlights') }
}

export function StoreSettingsPage({ initial, loadError, canPublishPolicy = false }: { initial: GymSettingsEditorData | null; loadError?: string | null; canPublishPolicy?: boolean }) {
  const [settings, setSettings] = useState<Settings>(initial?.settings ?? null)
  const [policy, setPolicy] = useState<Policy>(initial?.participationPolicy ?? null)
  const [draft, setDraft] = useState(() => draftFrom(initial?.settings ?? null))
  const [baseline, setBaseline] = useState(() => draftFrom(initial?.settings ?? null))
  const [terms, setTerms] = useState(initial?.participationPolicy?.source === 'pasted' ? initial.participationPolicy.text : '')
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [termsMessage, setTermsMessage] = useState<{ tone: 'positive' | 'danger'; text: string } | null>(null)

  const dirty = !sameDraft(draft, baseline)
  const termsDirty = terms.trim() !== (policy?.source === 'pasted' ? policy.text : '').trim()
  useUnsavedChangesWarning(dirty || termsDirty)

  const form = draft.form
  const set = (key: TextField) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, form: { ...current.form, [key]: event.target.value } }))
  const setHours = (update: (hours: HoursState) => HoursState) => setDraft((current) => ({ ...current, hours: update(current.hours) }))

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Store Settings' },
  ]

  const onSave = async () => {
    setError(null)
    // Only fields that changed are sent, so unrelated saves never rewrite hours, logo or content.
    const data: Record<string, unknown> = {}
    for (const field of TEXT_FIELDS) if (draft.form[field] !== baseline.form[field]) data[field] = draft.form[field]
    for (const [label, href] of [['heroPrimaryCtaLabel', 'heroPrimaryCtaHref'], ['heroSecondaryCtaLabel', 'heroSecondaryCtaHref']] as const) {
      if (label in data || href in data) { data[label] = draft.form[label]; data[href] = draft.form[href] }
      if (Boolean(draft.form[label].trim()) !== Boolean(draft.form[href].trim())) return setError('Each homepage button needs both a label and a link, or neither to use the default button.')
      if (draft.form[href].trim() && !publicCtaHref(draft.form[href])) return setError(`"${draft.form[href]}" isn't a public storefront page. Use a link such as /join, /schedule or /contact.`)
    }
    if (draft.logoIcon !== baseline.logoIcon) data.logoIcon = draft.logoIcon
    if (draft.logoColor !== baseline.logoColor) data.logoColor = normalizeGymLogoColor(draft.logoColor)
    if (!sameDraft(draft.hours, baseline.hours)) {
      const unset = days.find((day) => draft.hours[day.key].unset)
      if (unset) return setError(`Set ${unset.label}'s opening hours (closed, all day, or times) before saving hours.`)
      data.hours = serializeHours(draft.hours)
    }
    if (!sameDraft(draft.contactTopics, baseline.contactTopics)) {
      data.contactTopics = draft.contactTopics.map((item) => ({ title: item.title.trim(), details: item.details.map((line) => line.trim()).filter(Boolean) }))
    }
    if (!sameDraft(draft.facilityHighlights, baseline.facilityHighlights)) {
      data.facilityHighlights = draft.facilityHighlights.map((item) => ({ title: item.title.trim(), description: item.description.trim(), features: item.features.map((line) => line.trim()).filter(Boolean) }))
    }
    if (!Object.keys(data).length) return
    const submitted = draft
    setIsSaving(true)
    try {
      const result = await saveGymSettings(data, settings?.updatedAt ?? null)
      if (!result.success) throw new Error(result.error)
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
      // The baseline becomes what the server saved; anything typed during the save stays dirty.
      const reloaded = await loadGymSettingsEditor()
      if (!reloaded.success) {
        setBaseline(submitted)
        setError('Your changes were saved, but the saved values could not be reloaded. Reload the page before making more changes.')
        return
      }
      const saved = draftFrom(reloaded.data.settings)
      setSettings(reloaded.data.settings)
      setDraft((current) => mergeAfterSave(current, submitted, saved))
      setBaseline(saved)
    } catch (e: any) {
      setError(e?.message || 'Settings were not saved. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const onPublishTerms = async () => {
    setTermsMessage(null)
    const submittedTerms = terms
    setIsPublishing(true)
    try {
      const result = await publishParticipationTerms(submittedTerms, policy?.policyId ?? null)
      if (!result.success) throw new Error(result.error)
      setPolicy(result.policy)
      // Text typed while publishing stays as an unpublished draft.
      setTerms((current) => (current === submittedTerms ? (result.policy?.source === 'pasted' ? result.policy.text : '') : current))
      setTermsMessage({ tone: 'positive', text: result.policy ? `Published as version ${result.policy.version}.` : 'Terms cleared.' })
    } catch (e: any) {
      setTermsMessage({ tone: 'danger', text: e?.message || 'Terms were not published. Try again.' })
    } finally {
      setIsPublishing(false)
    }
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Store Settings</h1>
        <p className="text-muted-foreground">Public identity, contact details, opening hours and storefront copy.</p>
      </div>
      <div className="flex items-center gap-2">
        {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
        <Button onClick={onSave} disabled={isSaving || !dirty || Boolean(loadError)}>
          <Save className="size-4" aria-hidden />
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )

  const emailConfigured = isConfiguredPublicEmail(form.email)
  const contactLimit = SETTINGS_LIMITS.contactTopics.items
  const highlightLimit = SETTINGS_LIMITS.facilityHighlights.items

  return (
    <PageContainer title="Store Settings" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-6 px-4 pb-8 md:px-6">
        {loadError ? <Notice tone="danger" title="Settings could not be loaded">{loadError} Nothing on this page reflects saved values; reload before editing.</Notice> : null}
        {error ? <Notice tone="danger" title="Not saved">{error}</Notice> : null}

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[1.1fr_1fr]">
          <div className="grid min-w-0 gap-6">
            <Section id="identity" icon={Store} title="Identity and brand" description="Name, tagline and logo. The logo color also sets the storefront accent.">
              <PanelBody className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Gym name">
                    <FieldInput value={form.name} onChange={set('name')} maxLength={200} placeholder="e.g. Atlas Training Club" />
                  </FormField>
                  <FormField label="Tagline">
                    <FieldInput value={form.tagline} onChange={set('tagline')} maxLength={300} placeholder="Short public tagline" />
                  </FormField>
                </div>
                <FormField label="Description" hint="Used in search previews and the footer.">
                  <FieldInput value={form.description} onChange={set('description')} maxLength={2000} />
                </FormField>
                <div className="grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="grid min-w-0 content-start gap-1.5">
                    <span className="text-xs font-medium">Logo</span>
                    <LogoPicker value={draft.logoIcon} hue={draft.logoColor} onChange={(logoIcon) => setDraft((current) => ({ ...current, logoIcon }))} />
                  </div>
                  <LogoColorField
                    value={draft.logoColor}
                    svg={draft.logoIcon || DEFAULT_GYM_LOGO_ICON}
                    onChange={(logoColor) => setDraft((current) => ({ ...current, logoIcon: current.logoIcon || DEFAULT_GYM_LOGO_ICON, logoColor }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Storefront header</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[false, true].map((onDark) => (
                      <div key={String(onDark)} className={onDark ? 'flex min-w-0 items-center gap-2.5 rounded-lg bg-zinc-950 px-4 py-3 text-white' : 'flex min-w-0 items-center gap-2.5 rounded-lg border bg-white px-4 py-3 text-zinc-950'}>
                        <LogoMark svg={draft.logoIcon || DEFAULT_GYM_LOGO_ICON} logoColor={draft.logoColor} onDark={onDark} className="size-[30px]" />
                        <span className="grid min-w-0 gap-0.5 leading-none">
                          <strong className="truncate text-[17px] font-bold tracking-tight">{form.name || 'Gym name'}</strong>
                          {form.tagline ? <span className={onDark ? 'truncate text-xs text-white/60' : 'truncate text-xs text-zinc-500'}>{form.tagline}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </PanelBody>
            </Section>

            <Section id="contact" icon={Contact} title="Contact" description="Public contact details shown on the storefront.">
              <PanelBody className="grid gap-4">
                <FormField label="Address">
                  <FieldInput value={form.address} onChange={set('address')} maxLength={500} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_7rem]">
                  <FormField label="Phone">
                    <FieldInput value={form.phone} onChange={set('phone')} maxLength={50} />
                  </FormField>
                  <FormField label="Email" htmlFor="gym-contact-email">
                    <FieldInput id="gym-contact-email" type="email" value={form.email} onChange={set('email')} maxLength={320} aria-invalid={!emailConfigured || undefined} />
                  </FormField>
                  <FormField label="Country">
                    <FieldInput value={form.countryCode} onChange={(e) => setDraft((current) => ({ ...current, form: { ...current.form, countryCode: e.target.value.toUpperCase() } }))} maxLength={2} className="uppercase" />
                  </FormField>
                </div>
                {!emailConfigured ? <Notice tone="warning">Add a working contact email; the storefront hides placeholder addresses.</Notice> : null}
                <FormField label="Promo banner" optional hint="Announcement across the top of the storefront.">
                  <div className="relative">
                    <Megaphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <FieldInput value={form.promoBanner} onChange={set('promoBanner')} maxLength={500} className="pl-9" />
                  </div>
                </FormField>
              </PanelBody>
            </Section>

            <Section id="localization" icon={Globe2} title="Localization" description="Formatting and the time zone schedules and reports use.">
              <PanelBody className="grid gap-4 md:grid-cols-3">
                <FormField label="Currency" hint="Billing, retail and training use USD.">
                  <FieldInput value="USD" readOnly aria-readonly className="bg-muted/40" />
                </FormField>
                <FormField label="Locale">
                  <select value={form.locale} onChange={set('locale')} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                    {[...new Set([form.locale, ...localeOptions])].map((locale) => <option key={locale} value={locale}>{locale}</option>)}
                  </select>
                </FormField>
                <FormField label="Time zone">
                  <select value={form.timezone} onChange={set('timezone')} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                    {[...new Set([form.timezone, ...timezoneOptions])].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  </select>
                </FormField>
              </PanelBody>
            </Section>

            <Section id="hours" icon={Clock} title="Opening hours" description="Enforced at check-in and shown on the storefront. Split shifts and overnight hours are supported.">
              <WeeklyHoursEditor
                days={days}
                hours={draft.hours}
                locale={form.locale}
                timezone={form.timezone}
                error={null}
                onSetDayEnabled={(day, enabled) => setHours((hours) => ({ ...hours, [day]: { enabled, allDay: false, unset: false, ranges: enabled ? (hours[day].ranges.length ? hours[day].ranges : [{ open: '06:00', close: '21:00' }]) : [] } }))}
                onSetAllDay={(day, allDay) => setHours((hours) => ({ ...hours, [day]: { ...hours[day], allDay, ranges: allDay ? [] : [{ open: '06:00', close: '21:00' }] } }))}
                onSetRangeValue={(day, idx, key, value) => setHours((hours) => ({ ...hours, [day]: { ...hours[day], ranges: hours[day].ranges.map((range, i) => (i === idx ? { ...range, [key]: value } : range)) } }))}
                onAddRange={(day) => setHours((hours) => ({ ...hours, [day]: { ...hours[day], ranges: [...hours[day].ranges, { open: '17:00', close: '21:00' }] } }))}
                onRemoveRange={(day, idx) => setHours((hours) => ({ ...hours, [day]: { ...hours[day], ranges: hours[day].ranges.filter((_, i) => i !== idx) } }))}
                onCopyDayToAll={(source) => setHours((hours) => Object.fromEntries(days.map((day) => [day.key, { ...hours[source], ranges: hours[source].ranges.map((range) => ({ ...range })) }])) as unknown as HoursState)}
              />
            </Section>
          </div>

          <div className="grid min-w-0 gap-6">
            <Section id="hero" icon={Sparkles} title="Homepage hero" description="The first thing visitors read on the homepage.">
              <PanelBody className="grid gap-4">
                <FormField label="Eyebrow" optional hint="Short label above the headline.">
                  <FieldInput value={form.heroEyebrow} onChange={set('heroEyebrow')} maxLength={200} />
                </FormField>
                <FormField label="Headline">
                  <FieldTextarea value={form.heroHeadline} onChange={set('heroHeadline')} maxLength={1000} className="min-h-16 text-base font-medium" />
                </FormField>
                <FormField label="Subheadline">
                  <FieldInput value={form.heroSubheadline} onChange={set('heroSubheadline')} maxLength={2000} />
                </FormField>
                <FormField label="Hero image path" hint="An existing image under /images/.">
                  <FieldInput value={form.heroImageUrl} onChange={set('heroImageUrl')} maxLength={500} className="font-mono text-xs" />
                </FormField>
                <div className="grid gap-4 rounded-lg border p-3.5 sm:grid-cols-2">
                  <FormField label="Primary button label" optional>
                    <FieldInput value={form.heroPrimaryCtaLabel} onChange={set('heroPrimaryCtaLabel')} maxLength={100} />
                  </FormField>
                  <FormField label="Primary button link" optional hint="Leave both empty for the default button.">
                    <FieldInput value={form.heroPrimaryCtaHref} onChange={set('heroPrimaryCtaHref')} maxLength={500} placeholder="/join" className="font-mono text-xs" />
                  </FormField>
                  <FormField label="Secondary button label" optional>
                    <FieldInput value={form.heroSecondaryCtaLabel} onChange={set('heroSecondaryCtaLabel')} maxLength={100} />
                  </FormField>
                  <FormField label="Secondary button link" optional>
                    <FieldInput value={form.heroSecondaryCtaHref} onChange={set('heroSecondaryCtaHref')} maxLength={500} placeholder="/schedule" className="font-mono text-xs" />
                  </FormField>
                </div>
              </PanelBody>
            </Section>

            <Section id="facility" icon={Building2} title="Facility and footer" description="Facilities page heading and footer copy.">
              <PanelBody className="grid gap-4">
                <FormField label="Facility headline">
                  <FieldInput value={form.facilityHeadline} onChange={set('facilityHeadline')} maxLength={300} />
                </FormField>
                <FormField label="Facility description">
                  <FieldInput value={form.facilityDescription} onChange={set('facilityDescription')} maxLength={2000} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Footer tagline">
                    <FieldInput value={form.footerTagline} onChange={set('footerTagline')} maxLength={500} />
                  </FormField>
                  <FormField label="Copyright name">
                    <FieldInput value={form.copyrightName} onChange={set('copyrightName')} maxLength={200} />
                  </FormField>
                </div>
              </PanelBody>
            </Section>

            <Section
              id="participation"
              icon={FileText}
              title="Participation terms"
              description="Members accept published terms at sign-up, when joining and before booking. Publishing changed text creates a new version they accept again."
            >
              <PanelBody className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  {!policy
                    ? 'No terms are published.'
                    : policy.placeholder
                      ? `Version ${policy.version} is the setup placeholder. Members aren't shown it or asked to accept it.`
                      : policy.source === 'document'
                        ? `Version ${policy.version} links to ${policy.documentReference}. Publishing pasted terms replaces it.`
                        : `Version ${policy.version} is published at /waiver${policy.acceptanceRequired ? ' and members accept it before booking' : ''}.`}
                  {policy ? ` Age rule: ${policy.adultOnly ? 'adults only' : 'none'}. Health data: ${policy.healthPurpose ? policy.healthPurpose : 'not collected'}. Retention: ${policy.retentionDays} days. These carry over to a new version.` : ''}
                </p>
                <FormField label="Terms text">
                  <FieldTextarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={10} maxLength={50000} className="min-h-48 text-sm" readOnly={!canPublishPolicy} />
                </FormField>
                {termsMessage ? <Notice tone={termsMessage.tone}>{termsMessage.text}</Notice> : null}
                {canPublishPolicy ? (
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={onPublishTerms} disabled={isPublishing || !termsDirty}>
                      {isPublishing ? 'Publishing…' : terms.trim() ? 'Publish terms' : 'Clear published terms'}
                    </Button>
                  </div>
                ) : <p className="text-xs text-muted-foreground">Only operations managers can publish or clear participation terms.</p>}
              </PanelBody>
            </Section>

            <Section
              id="contact-cards"
              icon={Contact}
              title="Contact cards"
              description={`Blocks on the contact page. Up to ${contactLimit}, each with a title and at least one detail.`}
              actions={<Button type="button" variant="outline" size="sm" disabled={draft.contactTopics.length >= contactLimit} onClick={() => setDraft((current) => ({ ...current, contactTopics: [...current.contactTopics, { title: '', details: [] }] }))}><Plus aria-hidden /> Add card</Button>}
            >
              <PanelBody className="grid gap-3">
                {draft.contactTopics.length === 0 ? <p className="text-sm text-muted-foreground">No contact cards.</p> : null}
                {draft.contactTopics.map((item, index) => (
                  <RepeaterItem key={`contact-${index}`} label={`Card ${index + 1}`} onRemove={() => setDraft((current) => ({ ...current, contactTopics: current.contactTopics.filter((_, i) => i !== index) }))}>
                    <FormField label="Title">
                      <FieldInput value={item.title} maxLength={SETTINGS_LIMITS.contactTopics.title} onChange={(e) => setDraft((current) => ({ ...current, contactTopics: current.contactTopics.map((row, i) => (i === index ? { ...row, title: e.target.value } : row)) }))} />
                    </FormField>
                    <FormField label="Details" hint={`One per line, up to ${SETTINGS_LIMITS.contactTopics.details}.`}>
                      <FieldTextarea value={item.details.join('\n')} onChange={(e) => setDraft((current) => ({ ...current, contactTopics: current.contactTopics.map((row, i) => (i === index ? { ...row, details: e.target.value.split('\n') } : row)) }))} />
                    </FormField>
                  </RepeaterItem>
                ))}
              </PanelBody>
            </Section>

            <Section
              id="facility-highlights"
              icon={Building2}
              title="Facility highlights"
              description={`Cards on the facilities page. Up to ${highlightLimit}, each with a title and description.`}
              actions={<Button type="button" variant="outline" size="sm" disabled={draft.facilityHighlights.length >= highlightLimit} onClick={() => setDraft((current) => ({ ...current, facilityHighlights: [...current.facilityHighlights, { title: '', description: '', features: [] }] }))}><Plus aria-hidden /> Add highlight</Button>}
            >
              <PanelBody className="grid gap-3">
                {draft.facilityHighlights.length === 0 ? <p className="text-sm text-muted-foreground">No facility highlights.</p> : null}
                {draft.facilityHighlights.map((item, index) => (
                  <RepeaterItem key={`facility-${index}`} label={`Highlight ${index + 1}`} onRemove={() => setDraft((current) => ({ ...current, facilityHighlights: current.facilityHighlights.filter((_, i) => i !== index) }))}>
                    <FormField label="Title">
                      <FieldInput value={item.title} maxLength={SETTINGS_LIMITS.facilityHighlights.title} onChange={(e) => setDraft((current) => ({ ...current, facilityHighlights: current.facilityHighlights.map((row, i) => (i === index ? { ...row, title: e.target.value } : row)) }))} />
                    </FormField>
                    <FormField label="Description">
                      <FieldTextarea value={item.description} maxLength={SETTINGS_LIMITS.facilityHighlights.description} onChange={(e) => setDraft((current) => ({ ...current, facilityHighlights: current.facilityHighlights.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)) }))} />
                    </FormField>
                    <FormField label="Features" hint={`One per line, up to ${SETTINGS_LIMITS.facilityHighlights.features}.`}>
                      <FieldTextarea value={item.features.join('\n')} onChange={(e) => setDraft((current) => ({ ...current, facilityHighlights: current.facilityHighlights.map((row, i) => (i === index ? { ...row, features: e.target.value.split('\n') } : row)) }))} />
                    </FormField>
                  </RepeaterItem>
                ))}
              </PanelBody>
            </Section>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

export default StoreSettingsPage
