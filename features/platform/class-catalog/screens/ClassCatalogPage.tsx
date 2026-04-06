'use client'

import { useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dumbbell, Flame, Plus, Save } from 'lucide-react'

type ClassTypeRecord = {
  id?: string
  name: string
  description?: any
  difficulty?: string | null
  duration?: number | null
  caloriesBurn?: number | null
  equipmentNeeded?: string[] | null
}

const UPDATE_CLASS_TYPE = gql`
  mutation UpdateClassType($id: ID!, $data: ClassTypeUpdateInput!) {
    updateClassType(where: { id: $id }, data: $data) {
      id
      name
    }
  }
`

const CREATE_CLASS_TYPE = gql`
  mutation CreateClassType($data: ClassTypeCreateInput!) {
    createClassType(data: $data) {
      id
      name
    }
  }
`

const EQUIPMENT_OPTIONS = [
  { value: 'mat', label: 'Mat' },
  { value: 'weights', label: 'Weights' },
  { value: 'resistance_bands', label: 'Resistance Bands' },
  { value: 'jump_rope', label: 'Jump Rope' },
  { value: 'boxing_gloves', label: 'Boxing Gloves' },
  { value: 'cycling_shoes', label: 'Cycling Shoes' },
  { value: 'kettlebells', label: 'Kettlebells' },
  { value: 'medicine_ball', label: 'Medicine Ball' },
  { value: 'none', label: 'None' },
]

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

function normalizeClassType(record?: ClassTypeRecord | null) {
  return {
    id: record?.id,
    name: record?.name || '',
    description: documentToText(record?.description),
    difficulty: record?.difficulty || 'all-levels',
    duration: record?.duration ?? 60,
    caloriesBurn: record?.caloriesBurn ?? 0,
    equipmentNeeded: Array.isArray(record?.equipmentNeeded) ? record.equipmentNeeded : [],
  }
}

const emptyClassType = normalizeClassType(null)

export function ClassCatalogPage({ initialClassTypes }: { initialClassTypes: ClassTypeRecord[] }) {
  const [classTypes, setClassTypes] = useState<ClassTypeRecord[]>(initialClassTypes)
  const [selectedClassTypeId, setSelectedClassTypeId] = useState<string | 'new'>(initialClassTypes[0]?.id || 'new')
  const [form, setForm] = useState(() => normalizeClassType(initialClassTypes[0] || null))
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Class Catalog' },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Class catalog</h1>
      <p className="text-muted-foreground">Define the reusable class offerings used by the storefront, schedules, and instructor programming.</p>
    </div>
  )

  const avgDuration = useMemo(() => {
    if (!classTypes.length) return 0
    return Math.round(classTypes.reduce((sum, ct) => sum + (ct.duration || 0), 0) / classTypes.length)
  }, [classTypes])

  const selectClassType = (id: string | 'new') => {
    setSelectedClassTypeId(id)
    if (id === 'new') {
      setForm(emptyClassType)
      return
    }
    const selected = classTypes.find((item) => item.id === id)
    setForm(normalizeClassType(selected || null))
  }

  const createNewClassType = () => {
    setSelectedClassTypeId('new')
    setForm(emptyClassType)
    setSavedAt(null)
    setError(null)
  }

  const toggleEquipment = (value: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      equipmentNeeded: checked
        ? [...current.equipmentNeeded, value]
        : current.equipmentNeeded.filter((item) => item !== value),
    }))
  }

  const saveClassType = async () => {
    setError(null)
    setIsSaving(true)

    try {
      const data: any = {
        name: form.name,
        description: toDocument(form.description),
        difficulty: form.difficulty,
        duration: Number(form.duration || 0),
        caloriesBurn: Number(form.caloriesBurn || 0),
        equipmentNeeded: form.equipmentNeeded,
      }

      if (selectedClassTypeId === 'new' || !form.id) {
        const result = await request<any>('/api/graphql', CREATE_CLASS_TYPE, { data })
        const created = { ...data, id: result?.createClassType?.id, description: toDocument(form.description) }
        const next = [...classTypes, created]
        setClassTypes(next)
        if (created.id) setSelectedClassTypeId(created.id)
        setForm(normalizeClassType(created))
      } else {
        await request('/api/graphql', UPDATE_CLASS_TYPE, { id: form.id, data })
        const next = classTypes.map((item) =>
          item.id === form.id ? { ...item, ...data, description: toDocument(form.description) } : item
        )
        setClassTypes(next)
      }

      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Failed to save class type')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer title="Class Catalog" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">Class types should be strong enough to power listings, schedules, booking context, and instructor programming.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
          <Button onClick={saveClassType} disabled={isSaving} className="h-8 text-xs px-4">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save Class'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Class types</p>
          <p className="text-xl font-semibold mt-1">{classTypes.length}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Average duration</p>
          <p className="text-xl font-semibold mt-1">{avgDuration}m</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected difficulty</p>
          <p className="text-sm font-semibold mt-1 capitalize">{form.difficulty}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Equipment tags</p>
          <p className="text-sm font-semibold mt-1">{form.equipmentNeeded.length}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 px-4 md:px-6 py-4 md:py-5 xl:grid-cols-[340px_1fr] xl:items-start overflow-auto">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-border bg-muted/20">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Catalog</span>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={createNewClassType}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New class
            </Button>
          </div>
          <div className="divide-y divide-border">
            {classTypes.map((item) => {
              const active = selectedClassTypeId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectClassType(item.id || 'new')}
                  className={`w-full px-5 py-4 text-left transition-colors ${active ? 'bg-muted' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.duration || 0} min</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{item.difficulty || 'all-levels'}</Badge>
                  </div>
                </button>
              )
            })}
            {classTypes.length === 0 && (
              <div className="px-5 py-10 text-sm text-muted-foreground">No class types yet. Create your first class format.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Dumbbell size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Identity & Positioning</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Class name</p>
                <Input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="HIIT" className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Difficulty</p>
                <Select value={form.difficulty} onValueChange={(value) => setForm((current) => ({ ...current, difficulty: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="all-levels">All levels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</p>
              <Textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Describe what members should expect from this class type." className="mt-1.5 min-h-[140px]" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Flame size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Format Details</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Duration (min)</p>
                <Input type="number" value={form.duration} onChange={(e) => setForm((current) => ({ ...current, duration: Number(e.target.value) }))} className="mt-1.5" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Calories burn</p>
                <Input type="number" value={form.caloriesBurn} onChange={(e) => setForm((current) => ({ ...current, caloriesBurn: Number(e.target.value) }))} className="mt-1.5" />
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Equipment needed</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {EQUIPMENT_OPTIONS.map((option) => {
                  const checked = form.equipmentNeeded.includes(option.value)
                  return (
                    <label key={option.value} className="flex items-center gap-3 rounded-md border border-border px-3 py-3 text-sm">
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleEquipment(option.value, Boolean(value))} />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
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

export default ClassCatalogPage
