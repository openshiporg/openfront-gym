"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Check, X, QrCode, Search, User, Clock, UserPlus, ShieldCheck, BadgeAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"

type CheckInResult = {
  success: boolean
  memberName?: string
  membershipTier?: string | null
  classCreditsRemaining?: number | null
  error?: string
}

type SearchResultMember = {
  id: string
  name: string
  email: string
  phone?: string
  status: string
  membershipTier?: string | null
  membershipStatus?: string | null
  classCreditsRemaining?: number | null
}

type RecentCheckIn = {
  id: string
  memberName: string
  time: string
  membershipTier?: string | null
}

const INACTIVITY_RESET_MS = 60_000

function formatCredits(value?: number | null) {
  if (value === -1) return "Unlimited classes"
  if (typeof value === "number") return `${value} class credits left`
  return "Credits unavailable"
}

export default function KioskCheckInPage() {
  const [authorization, setAuthorization] = useState<"checking" | "authorized" | "required" | "unconfigured">("checking")
  const [unlockToken, setUnlockToken] = useState("")
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [mode, setMode] = useState<"scan" | "search" | "guest">("scan")
  const [scanValue, setScanValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResultMember[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmittingScan, setIsSubmittingScan] = useState(false)
  const [isSubmittingGuest, setIsSubmittingGuest] = useState(false)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([])
  const [guestForm, setGuestForm] = useState({ name: "", phone: "", hostMember: "" })
  const guestIdempotencyKey = useRef(crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    fetch("/api/kiosk/session", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && data.authorized) setAuthorization("authorized")
        else setAuthorization(data.configured === false ? "unconfigured" : "required")
      })
      .catch(() => {
        if (!cancelled) setAuthorization("required")
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout

    const resetTimer = () => {
      clearTimeout(inactivityTimer)
      inactivityTimer = setTimeout(() => {
        setMode("scan")
        setScanValue("")
        setSearchQuery("")
        setSearchResults([])
        setCheckInResult(null)
        setGuestForm({ name: "", phone: "", hostMember: "" })
      }, INACTIVITY_RESET_MS)
    }

    const handleActivity = () => resetTimer()

    window.addEventListener("touchstart", handleActivity)
    window.addEventListener("mousemove", handleActivity)
    window.addEventListener("keydown", handleActivity)

    resetTimer()

    return () => {
      clearTimeout(inactivityTimer)
      window.removeEventListener("touchstart", handleActivity)
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
    }
  }, [])

  useEffect(() => {
    if (!checkInResult) return
    const timer = setTimeout(() => setCheckInResult(null), 5000)
    return () => clearTimeout(timer)
  }, [checkInResult])

  const pushRecentCheckIn = useCallback((entry: RecentCheckIn) => {
    setRecentCheckIns((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 10))
  }, [])

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsUnlocking(true)
    setUnlockError(null)
    try {
      const response = await fetch("/api/kiosk/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: unlockToken }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.authorized) {
        throw new Error(data.error || "Kiosk unlock failed")
      }
      setUnlockToken("")
      setAuthorization("authorized")
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "Kiosk unlock failed")
    } finally {
      setIsUnlocking(false)
    }
  }

  const requireUnlock = useCallback((response: Response) => {
    if (response.status !== 401) return false
    setAuthorization("required")
    setUnlockError("The kiosk session expired. Ask a staff member to unlock it again.")
    return true
  }, [])

  const handleMemberSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch("/api/kiosk/search-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      })

      const data = await response.json()
      if (requireUnlock(response)) return
      if (!response.ok) throw new Error(data.error || "Search failed")
      setSearchResults(data.members || [])
    } catch {
      toast.error("Search failed. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }, [requireUnlock, searchQuery])

  const handleCheckInByMemberId = useCallback(async (memberId: string) => {
    try {
      const response = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      })

      const data = await response.json()
      if (requireUnlock(response)) return

      if (data.success) {
        const result: CheckInResult = {
          success: true,
          memberName: data.memberName,
          membershipTier: data.membershipTier,
          classCreditsRemaining: data.classCreditsRemaining,
        }
        setCheckInResult(result)
        pushRecentCheckIn({
          id: data.checkInId,
          memberName: data.memberName,
          membershipTier: data.membershipTier,
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        })
        setSearchQuery("")
        setSearchResults([])
      } else {
        setCheckInResult({ success: false, error: data.error || "Check-in failed" })
      }
    } catch {
      setCheckInResult({ success: false, error: "Network error. Please try again." })
    }
  }, [pushRecentCheckIn, requireUnlock])

  const handleQrSubmit = useCallback(async () => {
    if (!scanValue.trim()) {
      toast.error("Paste or scan a QR payload first")
      return
    }

    setIsSubmittingScan(true)
    try {
      const response = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: scanValue.trim() }),
      })

      const data = await response.json()
      if (requireUnlock(response)) return
      if (data.success) {
        setCheckInResult({
          success: true,
          memberName: data.memberName,
          membershipTier: data.membershipTier,
          classCreditsRemaining: data.classCreditsRemaining,
        })
        pushRecentCheckIn({
          id: data.checkInId,
          memberName: data.memberName,
          membershipTier: data.membershipTier,
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        })
        setScanValue("")
      } else {
        setCheckInResult({ success: false, error: data.error || "Check-in failed" })
      }
    } catch {
      setCheckInResult({ success: false, error: "Network error. Please try again." })
    } finally {
      setIsSubmittingScan(false)
    }
  }, [pushRecentCheckIn, requireUnlock, scanValue])

  const handleGuestCheckIn = useCallback(async () => {
    if (!guestForm.name.trim()) {
      toast.error("Please enter guest name")
      return
    }

    setIsSubmittingGuest(true)
    try {
      const response = await fetch("/api/kiosk/guest-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...guestForm, idempotencyKey: guestIdempotencyKey.current }),
      })

      const data = await response.json()
      if (requireUnlock(response)) return

      if (data.success) {
        const guestName = `Guest: ${guestForm.name.trim()}`
        setCheckInResult({ success: true, memberName: guestName })
        pushRecentCheckIn({
          id: data.checkInId,
          memberName: guestName,
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        })
        setGuestForm({ name: "", phone: "", hostMember: "" })
        guestIdempotencyKey.current = crypto.randomUUID()
        setMode("scan")
      } else {
        toast.error(data.error || "Guest check-in failed")
      }
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setIsSubmittingGuest(false)
    }
  }, [guestForm, pushRecentCheckIn, requireUnlock])

  if (authorization !== "authorized") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Staff kiosk unlock</h1>
          {authorization === "checking" ? (
            <p className="mt-3 text-sm text-muted-foreground">Checking this kiosk session…</p>
          ) : authorization === "unconfigured" ? (
            <Alert className="mt-5" variant="destructive">
              <AlertTitle>Kiosk is not configured</AlertTitle>
              <AlertDescription>
                Set KIOSK_ORGANIZATION_ID and a KIOSK_API_TOKEN of at least 32 characters, then reload this page.
              </AlertDescription>
            </Alert>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleUnlock}>
              <p className="text-sm leading-6 text-muted-foreground">
                A staff member must enter the server-configured kiosk credential. It is exchanged for a 12-hour, HttpOnly kiosk session and is not stored in the browser.
              </p>
              <div className="space-y-2">
                <Label htmlFor="kiosk-token">Kiosk credential</Label>
                <Input
                  id="kiosk-token"
                  type="password"
                  value={unlockToken}
                  onChange={(event) => setUnlockToken(event.target.value)}
                  minLength={32}
                  maxLength={512}
                  autoComplete="off"
                  required
                />
              </div>
              {unlockError ? (
                <Alert variant="destructive">
                  <AlertDescription>{unlockError}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={isUnlocking}>
                {isUnlocking ? "Unlocking…" : "Unlock kiosk"}
              </Button>
            </form>
          )}
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-background">
      {checkInResult && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${checkInResult.success ? "bg-emerald-500/90" : "bg-red-500/90"}`}>
          <div className="mx-6 max-w-2xl text-center text-white space-y-6">
            {checkInResult.success ? (
              <>
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-white">
                  <Check className="h-20 w-20 text-emerald-500" strokeWidth={4} />
                </div>
                <div>
                  <h2 className="mb-2 text-4xl font-bold">Welcome in</h2>
                  <p className="text-2xl">{checkInResult.memberName}</p>
                  {checkInResult.membershipTier && <p className="mt-2 text-xl opacity-90">{checkInResult.membershipTier}</p>}
                  {typeof checkInResult.classCreditsRemaining === "number" && (
                    <p className="mt-2 text-sm uppercase tracking-[0.18em] opacity-80">{formatCredits(checkInResult.classCreditsRemaining)}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-white">
                  <X className="h-20 w-20 text-red-500" strokeWidth={4} />
                </div>
                <div>
                  <h2 className="mb-2 text-4xl font-bold">Access denied</h2>
                  <p className="text-xl">{checkInResult.error}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid min-h-screen min-w-0 max-w-full lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 max-w-full flex-col p-6 md:p-8">
          <div className="mb-8 flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Kinetic Performance Club</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Kiosk check-in</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Fast entrance flow for members and guests. Accept QR payloads from the member app, run fallback member search, and log guest access at the front desk.
              </p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              Auto-resets after 60 seconds of inactivity
            </div>
          </div>

          <div className="mb-8 grid min-w-0 gap-4 md:grid-cols-3">
            <Button variant={mode === "scan" ? "default" : "outline"} onClick={() => setMode("scan")} size="lg" className="h-16 justify-start gap-3 text-lg">
              <QrCode className="h-5 w-5" />
              Scan / paste QR
            </Button>
            <Button variant={mode === "search" ? "default" : "outline"} onClick={() => setMode("search")} size="lg" className="h-16 justify-start gap-3 text-lg">
              <Search className="h-5 w-5" />
              Find member
            </Button>
            <Button variant={mode === "guest" ? "default" : "outline"} onClick={() => setMode("guest")} size="lg" className="h-16 justify-start gap-3 text-lg">
              <UserPlus className="h-5 w-5" />
              Guest check-in
            </Button>
          </div>

          <div className="min-w-0 max-w-full flex-1 overflow-hidden rounded-3xl border bg-card p-6 md:p-8">
            {mode === "scan" && (
              <div className="mx-auto max-w-3xl space-y-6">
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 md:p-10">
                  <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                    <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                      <QrCode className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold">Scan member QR code</h2>
                    <p className="mt-2 text-muted-foreground">
                      If your camera scanner acts like a keyboard wedge, click the field below and scan. You can also paste the raw QR payload from a test device.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="qr-payload" className="text-sm font-medium">QR payload</Label>
                  <Input
                    id="qr-payload"
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQrSubmit()}
                    placeholder="Scan or paste encoded member QR data"
                    className="h-16 px-5 font-mono text-base md:text-lg"
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handleQrSubmit} disabled={isSubmittingScan} size="lg" className="h-14 px-8 text-lg">
                    {isSubmittingScan ? "Checking in..." : "Validate and check in"}
                  </Button>
                  <Button variant="outline" size="lg" className="h-14 px-8 text-lg" onClick={() => setScanValue("")}>Clear</Button>
                </div>

                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Security note</AlertTitle>
                  <AlertDescription>
                    Member QR codes rotate every 30 seconds. Expired or tampered codes are rejected automatically.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {mode === "search" && (
              <div className="mx-auto min-w-0 max-w-4xl space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Search member fallback</h2>
                  <p className="mt-2 text-muted-foreground">
                    Use this when a member forgot their phone or QR code. Search by member name, email, or phone and complete a staffed check-in.
                  </p>
                </div>

                <div className="flex flex-col gap-4 md:flex-row">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleMemberSearch()}
                    placeholder="Search by name, email, or phone..."
                    className="h-16 px-6 text-lg"
                    autoFocus
                  />
                  <Button onClick={handleMemberSearch} disabled={isSearching} size="lg" className="h-16 px-8 text-lg">
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>

                {searchResults.length > 0 ? (
                  <div className="space-y-3">
                    {searchResults.map((member) => {
                      const accessAllowed = member.status === "active" && member.membershipStatus === "active"
                      return (
                        <button
                          key={member.id}
                          type="button"
                          disabled={!accessAllowed}
                          onClick={() => handleCheckInByMemberId(member.id)}
                          className="w-full min-w-0 max-w-full rounded-2xl border bg-background p-5 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-background"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                                  <User className="h-7 w-7 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="truncate text-xl font-bold">{member.name}</h3>
                                  <p className="truncate text-sm text-muted-foreground">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p>
                                </div>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                <span className="rounded-full border px-3 py-1">Member {member.status}</span>
                                <span className="rounded-full border px-3 py-1">Membership {member.membershipStatus || "none"}</span>
                                {member.membershipTier && <span className="rounded-full border px-3 py-1">{member.membershipTier}</span>}
                                <span className="rounded-full border px-3 py-1">{formatCredits(member.classCreditsRemaining)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {!accessAllowed && (
                                <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                                  <BadgeAlert className="h-3.5 w-3.5" /> Review required
                                </span>
                              )}
                              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                                {accessAllowed ? "Tap to check in" : "Front-desk review required"}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Search results will appear here.
                  </div>
                )}
              </div>
            )}

            {mode === "guest" && (
              <div className="mx-auto max-w-xl space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Guest check-in</h2>
                  <p className="mt-2 text-muted-foreground">
                    Capture a walk-in guest and optionally associate them with a host member for front-desk follow-up.
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="guest-name">Guest name *</Label>
                    <Input
                      id="guest-name"
                      value={guestForm.name}
                      onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                      placeholder="Full name"
                      className="h-14 text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-phone">Phone number</Label>
                    <Input
                      id="guest-phone"
                      value={guestForm.phone}
                      onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="h-14 text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-host">Host member</Label>
                    <Input
                      id="guest-host"
                      value={guestForm.hostMember}
                      onChange={(e) => setGuestForm({ ...guestForm, hostMember: e.target.value })}
                      placeholder="Member who invited this guest"
                      className="h-14 text-lg"
                    />
                  </div>
                </div>

                <Button onClick={handleGuestCheckIn} disabled={isSubmittingGuest} size="lg" className="h-14 w-full text-lg">
                  {isSubmittingGuest ? "Checking in guest..." : "Complete guest check-in"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 max-w-full border-l bg-muted/30 p-6">
          <div className="mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Recent check-ins</h3>
          </div>

          {recentCheckIns.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No recent activity in this kiosk session.
            </div>
          ) : (
            <div className="space-y-3">
              {recentCheckIns.map((checkIn) => (
                <div key={checkIn.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{checkIn.memberName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{checkIn.time}</p>
                      {checkIn.membershipTier && (
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{checkIn.membershipTier}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
