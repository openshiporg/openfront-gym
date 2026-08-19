'use client'

import { useMemo, useState } from 'react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { MapPin, Phone, Plus, Save } from 'lucide-react'
import { saveLocation as saveLocationRecord } from '../actions/locations'

type LocationRecord = {
  id?: string
  name: string
  address?: string | null
  phone?: string | null
  isActive?: boolean | null
}

function normalizeLocation(location?: LocationRecord | null) {
  return {
    id: location?.id,
    name: location?.name || '',
    address: location?.address || '',
    phone: location?.phone || '',
    isActive: location?.isActive ?? true,
  }
}

const emptyLocation = normalizeLocation(null)

export function LocationsPage({ initialLocations }: { initialLocations: LocationRecord[] }) {
  const [locations, setLocations] = useState<LocationRecord[]>(initialLocations)
  const [selectedLocationId, setSelectedLocationId] = useState<string | 'new'>(initialLocations[0]?.id || 'new')
  const [form, setForm] = useState(() => normalizeLocation(initialLocations[0] || null))
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locationQuery, setLocationQuery] = useState('')

  const filteredLocations = useMemo(() => locations
    .filter((location) => `${location.name} ${location.address || ''} ${location.phone || ''}`.toLowerCase().includes(locationQuery.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [locations, locationQuery])

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Locations' },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Locations</h1>
      <p className="text-muted-foreground">Manage active gym locations, facility contact info, and multi-site readiness.</p>
    </div>
  )

  const activeCount = useMemo(() => locations.filter((location) => location.isActive).length, [locations])

  const selectLocation = (id: string | 'new') => {
    setSelectedLocationId(id)
    if (id === 'new') {
      setForm(emptyLocation)
      return
    }
    const selected = locations.find((location) => location.id === id)
    setForm(normalizeLocation(selected || null))
  }

  const createNewLocation = () => {
    setSelectedLocationId('new')
    setForm(emptyLocation)
    setSavedAt(null)
    setError(null)
  }

  const saveLocation = async () => {
    setError(null)
    setIsSaving(true)

    try {
      const data = {
        name: form.name,
        address: form.address,
        phone: form.phone,
        isActive: Boolean(form.isActive),
      }

      if (selectedLocationId === 'new' || !form.id) {
        const result = await saveLocationRecord(data)
        const created = { ...data, id: result.id }
        const nextLocations = [...locations, created]
        setLocations(nextLocations)
        if (created.id) setSelectedLocationId(created.id)
        setForm(normalizeLocation(created))
      } else {
        await saveLocationRecord(data, form.id)
        const nextLocations = locations.map((location) =>
          location.id === form.id ? { ...location, ...data } : location
        )
        setLocations(nextLocations)
      }

      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Failed to save location')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer title="Locations" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">Use locations for operational facility records, front-desk workflows, and future multi-location scheduling.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">Saved {savedAt}</span> : null}
          <Button onClick={saveLocation} disabled={isSaving} className="h-8 text-xs px-4">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save Location'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total locations</p>
          <p className="text-xl font-semibold mt-1">{locations.length}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active locations</p>
          <p className="text-xl font-semibold mt-1">{activeCount}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected</p>
          <p className="text-sm font-semibold mt-1 truncate">{form.name || 'New location'}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="text-sm font-semibold mt-1">{form.isActive ? 'Active' : 'Inactive'}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 px-4 md:px-6 py-4 md:py-5 xl:grid-cols-[340px_1fr] xl:items-start overflow-auto">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="space-y-3 border-b border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-foreground">Facility records</span>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={createNewLocation}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New location
            </Button></div>
            <label><span className="sr-only">Search locations</span><Input type="search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Search name, address, or phone" /></label>
          </div>
          <div className="divide-y divide-border">
            {filteredLocations.map((location) => {
              const active = selectedLocationId === location.id
              return (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => selectLocation(location.id || 'new')}
                  className={`w-full px-5 py-4 text-left transition-colors ${active ? 'bg-muted' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{location.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{location.address || 'No address yet'}</p>
                    </div>
                    <Badge variant="outline">{location.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </button>
              )
            })}
            {filteredLocations.length === 0 && (
              <div className="px-5 py-10"><p className="text-sm font-medium">{locations.length ? 'No locations match this search.' : 'No locations yet.'}</p><p className="mt-1 text-xs text-muted-foreground">{locations.length ? 'Clear the search to restore all facilities.' : 'Create a facility before assigning front-desk activity.'}</p></div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <MapPin size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Location details</span>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Location name</p>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Downtown Club" className="mt-1.5" />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Address</p>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City, State" className="mt-1.5 min-h-[120px]" />
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Phone</p>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" className="mt-1.5" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Phone size={13} className="text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">Operational status</span>
            </div>
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Location active</p>
                <p className="text-xs text-muted-foreground">Inactive locations can be retained without appearing as the primary facility.</p>
              </div>
              <Switch checked={Boolean(form.isActive)} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
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

export default LocationsPage
