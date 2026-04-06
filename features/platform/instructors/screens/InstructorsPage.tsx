'use client'

import { useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GraduationCap, Plus, Save, UserRound } from 'lucide-react'

type InstructorRecord = {
  id?: string
  user?: { id: string; name?: string | null; email?: string | null } | null
  bio?: any
  specialties?: string[] | null
  certifications?: string[] | null
  photo?: string | null
  isActive?: boolean | null
  classSchedules?: { id: string }[] | null
  classInstances?: { id: string }[] | null
}

type InstructorUserOption = {
  id: string
  name?: string | null
  email?: string | null
}

const UPDATE_INSTRUCTOR = gql`
  mutation UpdateInstructor($id: ID!, $data: InstructorUpdateInput!) {
    updateInstructor(where: { id: $id }, data: $data) {
      id
      isActive
    }
  }
`

const CREATE_INSTRUCTOR = gql`
  mutation CreateInstructor($data: InstructorCreateInput!) {
    createInstructor(data: $data) {
      id
      isActive
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

function normalizeInstructor(record?: InstructorRecord | null) {
  return {
    id: record?.id,
    userId: record?.user?.id || '',
    bio: documentToText(record?.bio),
    specialties: Array.isArray(record?.specialties) ? record.specialties.join('\n') : '',
    certifications: Array.isArray(record?.certifications) ? record.certifications.join('\n') : '',
    photo: record?.photo || '',
    isActive: record?.isActive ?? true,
  }
}

const emptyInstructor = normalizeInstructor(null)

export function InstructorsPage({
  initialInstructors,
  userOptions,
}: {
  initialInstructors: InstructorRecord[]
  userOptions: InstructorUserOption[]
}) {
  const [instructors, setInstructors] = useState<InstructorRecord[]>(initialInstructors)
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | 'new'>(initialInstructors[0]?.id || 'new')
  const [form, setForm] = useState(() => normalizeInstructor(initialInstructors[0] || null))
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Instructors' },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Instructors</h1>
      <p className="text-muted-foreground">Manage instructor profiles, public bios, and teaching identity for storefront and scheduling surfaces.</p>
    </div>
  )

  const activeCount = useMemo(() => instructors.filter((inst) => inst.isActive).length, [instructors])
  const totalSchedules = useMemo(
    () => instructors.reduce((sum, inst) => sum + (inst.classSchedules?.length || 0), 0),
    [instructors]
  )

  const selectInstructor = (id: string | 'new') => {
    setSelectedInstructorId(id)
    if (id === 'new') {
      setForm(emptyInstructor)
      return
    }
    const selected = instructors.find((inst) => inst.id === id)
    setForm(normalizeInstructor(selected || null))
  }

  const createNewInstructor = () => {
    setSelectedInstructorId('new')
    setForm(emptyInstructor)
    setSavedAt(null)
    setError(null)
  }

  const selectedUser = userOptions.find((user) => user.id === form.userId)

  const saveInstructor = async () => {
    setError(null)
    setIsSaving(true)

    try {
      const data: any = {
        user: form.userId ? { connect: { id: form.userId } } : undefined,
        bio: toDocument(form.bio),
        specialties: form.specialties.split('\n').map((line) => line.trim()).filter(Boolean),
        certifications: form.certifications.split('\n').map((line) => line.trim()).filter(Boolean),
        photo: form.photo,
        isActive: Boolean(form.isActive),
      }

      if (selectedInstructorId === 'new' || !form.id) {
        const result = await request<any>('/api/graphql', CREATE_INSTRUCTOR, { data })
        const createdId = result?.createInstructor?.id
        const user = userOptions.find((option) => option.id === form.userId)
        const created = {
          id: createdId,
          user: user ? { id: user.id, name: user.name, email: user.email } : null,
          bio: toDocument(form.bio),
          specialties: data.specialties,
          certifications: data.certifications,
          photo: form.photo,
          isActive: form.isActive,
          classSchedules: [],
          classInstances: [],
        }
        const next = [...instructors, created]
        setInstructors(next)
        if (createdId) setSelectedInstructorId(createdId)
        setForm(normalizeInstructor(created))
      } else {
        await request('/api/graphql', UPDATE_INSTRUCTOR, { id: form.id, data })
        const next = instructors.map((inst) =>
          inst.id === form.id
            ? {
                ...inst,
                user: userOptions.find((option) => option.id === form.userId)
                  ? {
                      id: form.userId,
                      name: userOptions.find((option) => option.id === form.userId)?.name,
                      email: userOptions.find((option) => option.id === form.userId)?.email,
                    }
                  : inst.user,
                bio: toDocument(form.bio),
                specialties: data.specialties,
                certifications: data.certifications,
                photo: form.photo,
                isActive: form.isActive,
              }
            : inst
        )
        setInstructors(next)
      }

      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Failed to save instructor')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer title="Instructors" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">These records power the public instructor pages, storefront instructor console, and scheduling ownership.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
          <Button onClick={saveInstructor} disabled={isSaving} className="h-8 text-xs px-4">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save Instructor'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Instructor profiles</p>
          <p className="text-xl font-semibold mt-1">{instructors.length}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active</p>
          <p className="text-xl font-semibold mt-1">{activeCount}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Recurring schedules</p>
          <p className="text-xl font-semibold mt-1">{totalSchedules}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected user</p>
          <p className="text-sm font-semibold mt-1 truncate">{selectedUser?.name || selectedUser?.email || 'Unassigned'}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 px-4 md:px-6 py-4 md:py-5 xl:grid-cols-[340px_1fr] xl:items-start overflow-auto">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-border bg-muted/20">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Instructor roster</span>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={createNewInstructor}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New instructor
            </Button>
          </div>
          <div className="divide-y divide-border">
            {instructors.map((inst) => {
              const active = selectedInstructorId === inst.id
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => selectInstructor(inst.id || 'new')}
                  className={`w-full px-5 py-4 text-left transition-colors ${active ? 'bg-muted' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{inst.user?.name || 'Unlinked instructor'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{inst.user?.email || 'No linked account'}</p>
                    </div>
                    <Badge variant="outline">{inst.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </button>
              )
            })}
            {instructors.length === 0 && (
              <div className="px-5 py-10 text-sm text-muted-foreground">No instructors yet. Create your first instructor profile.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <UserRound size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Identity</span>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Linked user account</p>
              <Select value={form.userId} onValueChange={(value) => setForm((current) => ({ ...current, userId: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select an instructor user" /></SelectTrigger>
                <SelectContent>
                  {userOptions.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email || user.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Photo URL</p>
              <Input value={form.photo} onChange={(e) => setForm((current) => ({ ...current, photo: e.target.value }))} placeholder="https://..." className="mt-1.5" />
            </div>
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Active instructor</p>
                <p className="text-xs text-muted-foreground">Inactive instructors can remain in records without appearing as current coaches.</p>
              </div>
              <Switch checked={Boolean(form.isActive)} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <GraduationCap size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Public profile</span>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Bio</p>
              <Textarea value={form.bio} onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))} placeholder="Short public coaching bio" className="mt-1.5 min-h-[130px]" />
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Specialties</p>
                <Textarea value={form.specialties} onChange={(e) => setForm((current) => ({ ...current, specialties: e.target.value }))} placeholder="One specialty per line" className="mt-1.5 min-h-[120px]" />
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Certifications</p>
                <Textarea value={form.certifications} onChange={(e) => setForm((current) => ({ ...current, certifications: e.target.value }))} placeholder="One certification per line" className="mt-1.5 min-h-[120px]" />
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

export default InstructorsPage
