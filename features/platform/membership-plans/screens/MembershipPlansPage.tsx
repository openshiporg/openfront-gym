'use client'

import { useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Plus, Save, ShieldCheck, Ticket, Users } from 'lucide-react'

type MembershipPlan = {
  id?: string
  name: string
  description?: any
  monthlyPrice: number
  annualPrice: number
  classCreditsPerMonth: number
  accessHours?: string | null
  guestPasses: number
  personalTrainingSessions: number
  freezeAllowed: boolean
  contractLength: number
  billingInterval?: string | null
  features?: string[] | null
  maxClassBookings: number
  hasGuestPrivileges: boolean
  stripeMonthlyPriceId?: string | null
  stripeAnnualPriceId?: string | null
  stripeProductId?: string | null
}

const UPDATE_PLAN = gql`
  mutation UpdateMembershipTier($id: ID!, $data: MembershipTierUpdateInput!) {
    updateMembershipTier(where: { id: $id }, data: $data) {
      id
      name
    }
  }
`

const CREATE_PLAN = gql`
  mutation CreateMembershipTier($data: MembershipTierCreateInput!) {
    createMembershipTier(data: $data) {
      id
      name
    }
  }
`

function documentToText(value: any): string {
  if (!Array.isArray(value)) return ''
  return value
    .flatMap((node: any) => node?.children || [])
    .map((child: any) => child?.text || '')
    .join(' ')
    .trim()
}

function toDocument(value: string) {
  return [{ type: 'paragraph', children: [{ text: value }] }]
}

function normalizePlan(plan?: MembershipPlan | null) {
  return {
    id: plan?.id,
    name: plan?.name || '',
    description: documentToText(plan?.description),
    monthlyPrice: plan?.monthlyPrice ?? 0,
    annualPrice: plan?.annualPrice ?? 0,
    classCreditsPerMonth: plan?.classCreditsPerMonth ?? 0,
    accessHours: plan?.accessHours || 'limited',
    guestPasses: plan?.guestPasses ?? 0,
    personalTrainingSessions: plan?.personalTrainingSessions ?? 0,
    freezeAllowed: plan?.freezeAllowed ?? false,
    contractLength: plan?.contractLength ?? 0,
    billingInterval: plan?.billingInterval || 'monthly',
    features: Array.isArray(plan?.features) ? plan?.features.join('\n') : '',
    maxClassBookings: plan?.maxClassBookings ?? 0,
    hasGuestPrivileges: plan?.hasGuestPrivileges ?? false,
    stripeMonthlyPriceId: plan?.stripeMonthlyPriceId || '',
    stripeAnnualPriceId: plan?.stripeAnnualPriceId || '',
    stripeProductId: plan?.stripeProductId || '',
  }
}

const emptyPlan = normalizePlan(null)

export function MembershipPlansPage({ initialPlans }: { initialPlans: MembershipPlan[] }) {
  const [plans, setPlans] = useState<MembershipPlan[]>(initialPlans)
  const [selectedPlanId, setSelectedPlanId] = useState<string | 'new'>(initialPlans[0]?.id || 'new')
  const [form, setForm] = useState(() => normalizePlan(initialPlans[0] || null))
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Membership Plans' },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Membership plans</h1>
      <p className="text-muted-foreground">Adjust packaging, credits, access, and Stripe billing identifiers for gym memberships.</p>
    </div>
  )

  const activePlans = useMemo(() => plans.length, [plans])
  const avgMonthly = useMemo(() => {
    if (!plans.length) return 0
    return Math.round(plans.reduce((sum, plan) => sum + (plan.monthlyPrice || 0), 0) / plans.length)
  }, [plans])

  const selectPlan = (id: string | 'new') => {
    setSelectedPlanId(id)
    if (id === 'new') {
      setForm(emptyPlan)
      return
    }
    const selected = plans.find((plan) => plan.id === id)
    setForm(normalizePlan(selected || null))
  }

  const createNewPlan = () => {
    setSelectedPlanId('new')
    setForm(emptyPlan)
    setSavedAt(null)
    setError(null)
  }

  const savePlan = async () => {
    setError(null)
    setIsSaving(true)

    try {
      const data: any = {
        name: form.name,
        description: toDocument(form.description),
        monthlyPrice: Number(form.monthlyPrice || 0),
        annualPrice: Number(form.annualPrice || 0),
        classCreditsPerMonth: Number(form.classCreditsPerMonth || 0),
        accessHours: form.accessHours,
        guestPasses: Number(form.guestPasses || 0),
        personalTrainingSessions: Number(form.personalTrainingSessions || 0),
        freezeAllowed: Boolean(form.freezeAllowed),
        contractLength: Number(form.contractLength || 0),
        billingInterval: form.billingInterval,
        features: form.features.split('\n').map((line) => line.trim()).filter(Boolean),
        maxClassBookings: Number(form.maxClassBookings || 0),
        hasGuestPrivileges: Boolean(form.hasGuestPrivileges),
        stripeMonthlyPriceId: form.stripeMonthlyPriceId,
        stripeAnnualPriceId: form.stripeAnnualPriceId,
        stripeProductId: form.stripeProductId,
      }

      if (selectedPlanId === 'new' || !form.id) {
        const result = await request<any>('/api/graphql', CREATE_PLAN, { data })
        const created = { ...data, id: result?.createMembershipTier?.id, description: toDocument(form.description) }
        const nextPlans = [...plans, created]
        setPlans(nextPlans)
        if (created.id) setSelectedPlanId(created.id)
        setForm(normalizePlan(created))
      } else {
        await request('/api/graphql', UPDATE_PLAN, { id: form.id, data })
        const nextPlans = plans.map((plan) =>
          plan.id === form.id ? { ...plan, ...data, description: toDocument(form.description) } : plan
        )
        setPlans(nextPlans)
      }

      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Failed to save membership plan')
    } finally {
      setIsSaving(false)
    }
  }

  const currentCreditsCopy =
    Number(form.classCreditsPerMonth) === -1
      ? 'Unlimited classes'
      : Number(form.classCreditsPerMonth) === 0
        ? 'Gym access only'
        : `${form.classCreditsPerMonth} classes / month`

  return (
    <PageContainer title="Membership Plans" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">Configure public plan packaging and the billing attributes that support checkout and provisioning.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
          <Button onClick={savePlan} disabled={isSaving} className="h-8 text-xs px-4">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save Plan'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active plans</p>
          <p className="text-xl font-semibold mt-1">{activePlans}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Average monthly</p>
          <p className="text-xl font-semibold mt-1">${avgMonthly}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected credits</p>
          <p className="text-sm font-semibold mt-1">{currentCreditsCopy}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Billing default</p>
          <p className="text-sm font-semibold mt-1 capitalize">{form.billingInterval}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 px-4 md:px-6 py-4 md:py-5 xl:grid-cols-[340px_1fr] xl:items-start overflow-auto">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-border bg-muted/20">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Plans</span>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={createNewPlan}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New plan
            </Button>
          </div>
          <div className="divide-y divide-border">
            {plans.map((plan) => {
              const active = selectedPlanId === plan.id
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => selectPlan(plan.id || 'new')}
                  className={`w-full px-5 py-4 text-left transition-colors ${active ? 'bg-muted' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">${Math.round(plan.monthlyPrice || 0)} / month</p>
                    </div>
                    <Badge variant="outline">{plan.classCreditsPerMonth === -1 ? 'Unlimited' : `${plan.classCreditsPerMonth}`}</Badge>
                  </div>
                </button>
              )
            })}
            {plans.length === 0 && (
              <div className="px-5 py-10 text-sm text-muted-foreground">No plans yet. Create your first membership plan.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <CreditCard size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Plan Identity</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Plan name</p>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Premium Monthly" className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Billing interval</p>
                <Select value={form.billingInterval} onValueChange={(value) => setForm((f) => ({ ...f, billingInterval: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Public description</p>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe who this plan is for and what it includes." className="mt-1.5 min-h-[110px]" />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Feature bullets</p>
              <Textarea value={form.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} placeholder="One feature per line" className="mt-1.5 min-h-[120px]" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Ticket size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Pricing & Access</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Monthly price</p>
                <Input type="number" step="0.01" value={form.monthlyPrice} onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Annual price</p>
                <Input type="number" step="0.01" value={form.annualPrice} onChange={(e) => setForm((f) => ({ ...f, annualPrice: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Class credits</p>
                <Input type="number" value={form.classCreditsPerMonth} onChange={(e) => setForm((f) => ({ ...f, classCreditsPerMonth: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Access hours</p>
                <Input value={form.accessHours} onChange={(e) => setForm((f) => ({ ...f, accessHours: e.target.value }))} placeholder="24/7 or 6am-10pm" className="mt-1.5" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Users size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Entitlements & Limits</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Guest passes</p>
                <Input type="number" value={form.guestPasses} onChange={(e) => setForm((f) => ({ ...f, guestPasses: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">PT sessions</p>
                <Input type="number" value={form.personalTrainingSessions} onChange={(e) => setForm((f) => ({ ...f, personalTrainingSessions: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Contract length</p>
                <Input type="number" value={form.contractLength} onChange={(e) => setForm((f) => ({ ...f, contractLength: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Max active bookings</p>
                <Input type="number" value={form.maxClassBookings} onChange={(e) => setForm((f) => ({ ...f, maxClassBookings: Number(e.target.value) }))} className="mt-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Freeze allowed</p>
                  <p className="text-xs text-muted-foreground">Allow members to temporarily freeze the membership.</p>
                </div>
                <Switch checked={form.freezeAllowed} onCheckedChange={(checked) => setForm((f) => ({ ...f, freezeAllowed: checked }))} />
              </div>
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Guest privileges</p>
                  <p className="text-xs text-muted-foreground">Expose guest access behavior as part of the plan.</p>
                </div>
                <Switch checked={form.hasGuestPrivileges} onCheckedChange={(checked) => setForm((f) => ({ ...f, hasGuestPrivileges: checked }))} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <ShieldCheck size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Stripe Mapping</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Stripe product ID</p>
                <Input value={form.stripeProductId} onChange={(e) => setForm((f) => ({ ...f, stripeProductId: e.target.value }))} placeholder="prod_..." className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Monthly price ID</p>
                <Input value={form.stripeMonthlyPriceId} onChange={(e) => setForm((f) => ({ ...f, stripeMonthlyPriceId: e.target.value }))} placeholder="price_..." className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Annual price ID</p>
                <Input value={form.stripeAnnualPriceId} onChange={(e) => setForm((f) => ({ ...f, stripeAnnualPriceId: e.target.value }))} placeholder="price_..." className="mt-1.5" />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

export default MembershipPlansPage
