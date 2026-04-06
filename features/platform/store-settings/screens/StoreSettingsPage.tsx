'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { gql, request } from 'graphql-request'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Globe2, Save, Store, Building2, Sparkles, Plus, Trash2, Contact, ChartNoAxesColumn } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import {
  WeeklyHoursEditor,
  type DayKey,
  type HoursState,
} from '@/features/platform/store-settings/components/WeeklyHoursEditor'

interface GymSettingsData {
  id?: string
  name: string
  tagline?: string | null
  description?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  currencyCode?: string | null
  locale?: string | null
  timezone?: string | null
  countryCode?: string | null
  promoBanner?: string | null
  heroEyebrow?: string | null
  heroHeadline?: string | null
  heroSubheadline?: string | null
  heroPrimaryCtaLabel?: string | null
  heroPrimaryCtaHref?: string | null
  heroSecondaryCtaLabel?: string | null
  heroSecondaryCtaHref?: string | null
  footerTagline?: string | null
  copyrightName?: string | null
  facilityHeadline?: string | null
  facilityDescription?: string | null
  facilityHighlights?: any[] | null
  heroStats?: any[] | null
  contactTopics?: any[] | null
  rating?: string | null
  reviewCount?: number | null
  hours?: any
}

const UPDATE_GYM_SETTINGS = gql`
  mutation UpdateGymSettings($id: ID!, $data: GymSettingsUpdateInput!) {
    updateGymSettings(where: { id: $id }, data: $data) {
      id
      name
      locale
      timezone
      hours
    }
  }
`

const CREATE_GYM_SETTINGS = gql`
  mutation CreateGymSettings($data: GymSettingsCreateInput!) {
    createGymSettings(data: $data) {
      id
      name
    }
  }
`

const days: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
]

const defaultHours: HoursState = {
  monday: { enabled: true, ranges: [{ open: '05:00', close: '22:00' }] },
  tuesday: { enabled: true, ranges: [{ open: '05:00', close: '22:00' }] },
  wednesday: { enabled: true, ranges: [{ open: '05:00', close: '22:00' }] },
  thursday: { enabled: true, ranges: [{ open: '05:00', close: '22:00' }] },
  friday: { enabled: true, ranges: [{ open: '05:00', close: '21:00' }] },
  saturday: { enabled: true, ranges: [{ open: '06:00', close: '18:00' }] },
  sunday: { enabled: true, ranges: [{ open: '07:00', close: '16:00' }] },
}

function toTimeInput(raw: string): string {
  if (!raw) return '05:00'
  const normalized = raw.trim().toLowerCase()
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized
  const m = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!m) return '05:00'

  let h = Number.parseInt(m[1], 10)
  const mins = Number.parseInt(m[2] || '0', 10)
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0

  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function parseHours(raw: any): HoursState {
  if (!raw || typeof raw !== 'object') return defaultHours
  const out: any = { ...defaultHours }

  for (const day of days) {
    const value = raw[day.key]
    if (!value) continue

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (!normalized || normalized === 'closed') {
        out[day.key] = { enabled: false, ranges: [] }
        continue
      }
      const [open, close] = value.split('-').map((s: string) => s.trim())
      if (open && close) {
        out[day.key] = { enabled: true, ranges: [{ open: toTimeInput(open), close: toTimeInput(close) }] }
      }
      continue
    }

    if (typeof value === 'object') {
      const enabled = value.enabled !== false
      if (Array.isArray(value.ranges) && value.ranges.length) {
        out[day.key] = {
          enabled,
          ranges: value.ranges.map((r: any) => ({
            open: toTimeInput(r.open || '05:00'),
            close: toTimeInput(r.close || '22:00'),
          })),
        }
      } else {
        out[day.key] = { enabled, ranges: enabled ? [{ open: '05:00', close: '22:00' }] : [] }
      }
    }
  }

  return out
}

function serializeHours(hours: HoursState) {
  const payload: Record<string, any> = {}
  for (const day of days) {
    const item = hours[day.key]
    payload[day.key] = { enabled: item.enabled, ranges: item.enabled ? item.ranges : [] }
  }
  return payload
}

const timezoneOptions = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]
const localeOptions = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT']
const currencyOptions = ['USD', 'EUR', 'GBP', 'AED', 'PKR', 'INR', 'JPY', 'AUD', 'CAD']

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </div>
  )
}

const fieldInput = 'h-auto px-0 py-0 border-0 shadow-none bg-transparent text-sm font-semibold mt-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40 placeholder:font-normal w-full'
const fieldSelect = 'h-auto px-0 py-0 border-0 shadow-none bg-transparent text-sm font-semibold mt-1.5 focus:ring-0 focus:ring-offset-0 [&>svg]:size-3.5 [&>svg]:opacity-40 [&>svg]:ml-1 gap-0 w-full [&>span]:text-left [&>span]:truncate [&>span]:block'
const fieldTextarea = 'min-h-[90px] border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40 placeholder:font-normal resize-none mt-1.5'

type DetailBlock = { title: string; details: string[] }
type HighlightBlock = { title: string; description: string; features: string[] }
type HeroStatBlock = { value: string; label: string }

function normalizeDetails(raw: any, fallback: DetailBlock[]): DetailBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  return raw.map((item: any) => ({
    title: item?.title || '',
    details: Array.isArray(item?.details) ? item.details.map((d: any) => String(d)) : [''],
  }))
}

function normalizeHighlights(raw: any, fallback: HighlightBlock[]): HighlightBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  return raw.map((item: any) => ({
    title: item?.title || '',
    description: item?.description || '',
    features: Array.isArray(item?.features) ? item.features.map((d: any) => String(d)) : [''],
  }))
}

function normalizeStats(raw: any, fallback: HeroStatBlock[]): HeroStatBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  return raw.map((item: any) => ({ value: item?.value || '', label: item?.label || '' }))
}

export function StoreSettingsPage({ initialSettings }: { initialSettings: GymSettingsData | null }) {
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: initialSettings?.name || 'Openfront Gym',
    tagline: initialSettings?.tagline || '',
    description: initialSettings?.description || '',
    address: initialSettings?.address || '',
    phone: initialSettings?.phone || '',
    email: initialSettings?.email || '',
    currencyCode: initialSettings?.currencyCode || 'USD',
    locale: initialSettings?.locale || 'en-US',
    timezone: initialSettings?.timezone || 'America/New_York',
    countryCode: initialSettings?.countryCode || 'US',
    promoBanner: initialSettings?.promoBanner || '',
    heroEyebrow: initialSettings?.heroEyebrow || '',
    heroHeadline: initialSettings?.heroHeadline || '',
    heroSubheadline: initialSettings?.heroSubheadline || '',
    heroPrimaryCtaLabel: initialSettings?.heroPrimaryCtaLabel || 'Start membership',
    heroPrimaryCtaHref: initialSettings?.heroPrimaryCtaHref || '/join',
    heroSecondaryCtaLabel: initialSettings?.heroSecondaryCtaLabel || 'View schedule',
    heroSecondaryCtaHref: initialSettings?.heroSecondaryCtaHref || '/schedule',
    footerTagline: initialSettings?.footerTagline || '',
    copyrightName: initialSettings?.copyrightName || '',
    facilityHeadline: initialSettings?.facilityHeadline || '',
    facilityDescription: initialSettings?.facilityDescription || '',
    rating: initialSettings?.rating || '4.8',
    reviewCount: initialSettings?.reviewCount ?? 0,
  })

  const [hours, setHours] = useState<HoursState>(parseHours(initialSettings?.hours))
  const [heroStats, setHeroStats] = useState<HeroStatBlock[]>(
    normalizeStats(initialSettings?.heroStats, [
      { value: '24/7', label: 'Top-tier access' },
      { value: '15', label: 'Weekly recurring sessions' },
    ])
  )
  const [contactTopics, setContactTopics] = useState<DetailBlock[]>(
    normalizeDetails(initialSettings?.contactTopics, [
      { title: 'Location', details: ['123 Main St'] },
      { title: 'Phone', details: ['(555) 000-0000'] },
    ])
  )
  const [facilityHighlights, setFacilityHighlights] = useState<HighlightBlock[]>(
    normalizeHighlights(initialSettings?.facilityHighlights, [
      {
        title: 'Weight training floor',
        description: 'Heavy iron, racks, platforms, and cable stations.',
        features: ['Power racks', 'Olympic platforms'],
      },
    ])
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Gym Settings' },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Gym settings</h1>
      <p className="text-muted-foreground">Brand, hours, public contact info, and storefront messaging for your gym.</p>
    </div>
  )

  const todaySummary = useMemo(() => {
    const day = days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
    const today = hours[day.key]
    if (!today.enabled || today.ranges.length === 0) return `${day.label}: Closed`
    const first = today.ranges[0]
    return `${day.label}: ${first.open} to ${first.close}`
  }, [hours])

  const openDaysCount = useMemo(() => days.filter((d) => hours[d.key].enabled).length, [hours])

  const setDayEnabled = (day: DayKey, enabled: boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled,
        ranges: enabled && prev[day].ranges.length === 0 ? [{ open: '05:00', close: '22:00' }] : prev[day].ranges,
      },
    }))
  }

  const setRangeValue = (day: DayKey, idx: number, key: 'open' | 'close', value: string) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        ranges: prev[day].ranges.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
      },
    }))
  }

  const addRange = (day: DayKey) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], ranges: [...prev[day].ranges, { open: '11:00', close: '15:00' }] },
    }))
  }

  const removeRange = (day: DayKey, idx: number) => {
    setHours((prev) => {
      const nextRanges = prev[day].ranges.filter((_, i) => i !== idx)
      return {
        ...prev,
        [day]: { ...prev[day], ranges: nextRanges.length ? nextRanges : [{ open: '05:00', close: '22:00' }] },
      }
    })
  }

  const copyDayToAll = (sourceDay: DayKey) => {
    const source = hours[sourceDay]
    const copy: any = {}
    for (const day of days) {
      copy[day.key] = { enabled: source.enabled, ranges: source.ranges.map((r) => ({ ...r })) }
    }
    setHours(copy)
  }

  const addHeroStat = () => setHeroStats((prev) => [...prev, { value: '', label: '' }])
  const updateHeroStat = (index: number, key: keyof HeroStatBlock, value: string) => {
    setHeroStats((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  }
  const removeHeroStat = (index: number) => setHeroStats((prev) => prev.filter((_, i) => i !== index))

  const addContactTopic = () => setContactTopics((prev) => [...prev, { title: '', details: [''] }])
  const updateContactTopic = (index: number, key: 'title' | 'details', value: string) => {
    setContactTopics((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, [key]: key === 'details' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value }
          : item
      )
    )
  }
  const removeContactTopic = (index: number) => setContactTopics((prev) => prev.filter((_, i) => i !== index))

  const addFacilityHighlight = () =>
    setFacilityHighlights((prev) => [...prev, { title: '', description: '', features: [''] }])
  const updateFacilityHighlight = (index: number, key: 'title' | 'description' | 'features', value: string) => {
    setFacilityHighlights((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, [key]: key === 'features' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value }
          : item
      )
    )
  }
  const removeFacilityHighlight = (index: number) => setFacilityHighlights((prev) => prev.filter((_, i) => i !== index))

  const onSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const data: any = {
        ...form,
        reviewCount: Number(form.reviewCount || 0),
        hours: serializeHours(hours),
        heroStats,
        contactTopics,
        facilityHighlights,
      }

      if (initialSettings?.id) {
        await request('/api/graphql', UPDATE_GYM_SETTINGS, { id: initialSettings.id, data })
      } else {
        await request('/api/graphql', CREATE_GYM_SETTINGS, { data })
      }

      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Failed to save gym settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer title="Gym Settings" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">Control your storefront identity, public contact details, and onboarding-backed gym profile.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
          <Button onClick={onSave} disabled={isSaving} className="h-8 text-xs px-4">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Open Days</p>
          <p className="text-xl font-semibold mt-1">{openDaysCount}<span className="text-sm text-muted-foreground font-normal"> / 7</span></p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</p>
          <p className="text-sm font-semibold mt-1 truncate">{todaySummary}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Currency</p>
          <p className="text-sm font-semibold mt-1">{form.currencyCode} · {form.locale}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Timezone</p>
          <p className="text-sm font-semibold mt-1 truncate">{form.timezone.split('/').pop()?.replace('_', ' ')}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 px-4 md:px-6 py-4 md:py-5 xl:grid-cols-[1.1fr_1fr] xl:items-start overflow-auto">
        <div className="space-y-6">
          <Section title="Identity & Contact" icon={<Store size={13} />}>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Gym Name</p>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Atlas Training Club" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tagline</p>
                <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Structured training for real life" className={fieldInput} />
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</p>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short public business description" className={fieldInput} />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Address</p>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City, State" className={fieldInput} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Phone</p>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</p>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="hello@gym.com" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Country Code</p>
                <Input value={form.countryCode} onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))} placeholder="US" className={fieldInput} />
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Promo Banner</p>
              <Input value={form.promoBanner} onChange={(e) => setForm((f) => ({ ...f, promoBanner: e.target.value }))} placeholder="Announcement shown across the storefront" className={fieldInput} />
            </div>
          </Section>

          <Section title="Localization" icon={<Globe2 size={13} />}>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Currency</p>
                <Select value={form.currencyCode} onValueChange={(v) => setForm((f) => ({ ...f, currencyCode: v }))}>
                  <SelectTrigger className={fieldSelect}><SelectValue /></SelectTrigger>
                  <SelectContent>{currencyOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Locale</p>
                <Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}>
                  <SelectTrigger className={fieldSelect}><SelectValue /></SelectTrigger>
                  <SelectContent>{localeOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Timezone</p>
                <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                  <SelectTrigger className={fieldSelect}><SelectValue /></SelectTrigger>
                  <SelectContent>{timezoneOptions.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reviews</p>
                <Input type="number" value={form.reviewCount} onChange={(e) => setForm((f) => ({ ...f, reviewCount: Number(e.target.value) }))} placeholder="0" className={fieldInput} />
              </div>
            </div>
          </Section>

          <Section title="Storefront Hero" icon={<Sparkles size={13} />}>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Eyebrow</p>
              <Input value={form.heroEyebrow} onChange={(e) => setForm((f) => ({ ...f, heroEyebrow: e.target.value }))} placeholder="Performance without compromise" className={fieldInput} />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Headline</p>
              <Input value={form.heroHeadline} onChange={(e) => setForm((f) => ({ ...f, heroHeadline: e.target.value }))} placeholder="Train hard. Recover well." className={fieldInput} />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Subheadline</p>
              <Input value={form.heroSubheadline} onChange={(e) => setForm((f) => ({ ...f, heroSubheadline: e.target.value }))} placeholder="Short explanation of the gym offer" className={fieldInput} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Primary CTA</p>
                <Input value={form.heroPrimaryCtaLabel} onChange={(e) => setForm((f) => ({ ...f, heroPrimaryCtaLabel: e.target.value }))} placeholder="Start membership" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Primary CTA Href</p>
                <Input value={form.heroPrimaryCtaHref} onChange={(e) => setForm((f) => ({ ...f, heroPrimaryCtaHref: e.target.value }))} placeholder="/join" className={fieldInput} />
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Secondary CTA</p>
                <Input value={form.heroSecondaryCtaLabel} onChange={(e) => setForm((f) => ({ ...f, heroSecondaryCtaLabel: e.target.value }))} placeholder="View schedule" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Secondary CTA Href</p>
                <Input value={form.heroSecondaryCtaHref} onChange={(e) => setForm((f) => ({ ...f, heroSecondaryCtaHref: e.target.value }))} placeholder="/schedule" className={fieldInput} />
              </div>
            </div>
          </Section>

          <Section title="Facility Messaging" icon={<Building2 size={13} />}>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Facility Headline</p>
              <Input value={form.facilityHeadline} onChange={(e) => setForm((f) => ({ ...f, facilityHeadline: e.target.value }))} placeholder="Facility systems" className={fieldInput} />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Facility Description</p>
              <Input value={form.facilityDescription} onChange={(e) => setForm((f) => ({ ...f, facilityDescription: e.target.value }))} placeholder="Training, recovery, and coaching in one environment" className={fieldInput} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Footer Tagline</p>
                <Input value={form.footerTagline} onChange={(e) => setForm((f) => ({ ...f, footerTagline: e.target.value }))} placeholder="Footer support copy" className={fieldInput} />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Copyright Name</p>
                <Input value={form.copyrightName} onChange={(e) => setForm((f) => ({ ...f, copyrightName: e.target.value }))} placeholder="Business legal/display name" className={fieldInput} />
              </div>
            </div>
          </Section>

          <Section title="Hero Stats" icon={<ChartNoAxesColumn size={13} />}>
            <div className="px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">These cards power the homepage performance stat strip.</p>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addHeroStat}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add stat
              </Button>
            </div>
            <div className="divide-y divide-border">
              {heroStats.map((stat, index) => (
                <div key={`stat-${index}`} className="grid grid-cols-[1fr_1fr_auto] divide-x divide-border">
                  <div className="px-5 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Value</p>
                    <Input value={stat.value} onChange={(e) => updateHeroStat(index, 'value', e.target.value)} placeholder="24/7" className={fieldInput} />
                  </div>
                  <div className="px-5 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Label</p>
                    <Input value={stat.label} onChange={(e) => updateHeroStat(index, 'label', e.target.value)} placeholder="Top-tier access" className={fieldInput} />
                  </div>
                  <div className="px-4 flex items-center justify-center">
                    <button type="button" onClick={() => removeHeroStat(index)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Contact Cards" icon={<Contact size={13} />}>
            <div className="px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Used by the contact page for location, phone, email, and support blocks.</p>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addContactTopic}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add card
              </Button>
            </div>
            <div className="divide-y divide-border">
              {contactTopics.map((item, index) => (
                <div key={`contact-${index}`} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Card {index + 1}</p>
                    <button type="button" onClick={() => removeContactTopic(index)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input value={item.title} onChange={(e) => updateContactTopic(index, 'title', e.target.value)} placeholder="Location" className={fieldInput} />
                  <Textarea value={item.details.join('\n')} onChange={(e) => updateContactTopic(index, 'details', e.target.value)} placeholder="One detail per line" className={fieldTextarea} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Facility Highlights" icon={<Building2 size={13} />}>
            <div className="px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">These blocks drive the facilities page cards.</p>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addFacilityHighlight}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add highlight
              </Button>
            </div>
            <div className="divide-y divide-border">
              {facilityHighlights.map((item, index) => (
                <div key={`facility-${index}`} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Highlight {index + 1}</p>
                    <button type="button" onClick={() => removeFacilityHighlight(index)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input value={item.title} onChange={(e) => updateFacilityHighlight(index, 'title', e.target.value)} placeholder="Weight training floor" className={fieldInput} />
                  <Textarea value={item.description} onChange={(e) => updateFacilityHighlight(index, 'description', e.target.value)} placeholder="Short description" className={fieldTextarea} />
                  <Textarea value={item.features.join('\n')} onChange={(e) => updateFacilityHighlight(index, 'features', e.target.value)} placeholder="One feature per line" className={fieldTextarea} />
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <WeeklyHoursEditor
            days={days}
            hours={hours}
            locale={form.locale}
            timezone={form.timezone}
            error={error}
            onSetDayEnabled={setDayEnabled}
            onSetRangeValue={setRangeValue}
            onAddRange={addRange}
            onRemoveRange={removeRange}
            onCopyDayToAll={copyDayToAll}
          />
        </div>
      </div>
    </PageContainer>
  )
}

export default StoreSettingsPage
