"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Check, X } from "lucide-react"
import { Banner, EmptyState } from "@/features/storefront/modules/common/ui"

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

export default function KioskCheckInPage({ brandName = "Front desk" }: { brandName?: string } = {}) {
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
  const [notice, setNotice] = useState<string | null>(null)

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
        setNotice(null)
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
      setNotice("Search failed. Please try again.")
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
      setNotice("Paste or scan a QR payload first")
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
      setNotice("Please enter guest name")
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
        setNotice(data.error || "Guest check-in failed")
      }
    } catch {
      setNotice("Network error. Please try again.")
    } finally {
      setIsSubmittingGuest(false)
    }
  }, [guestForm, pushRecentCheckIn, requireUnlock])

  const switchMode = (next: "scan" | "search" | "guest") => {
    setNotice(null)
    setMode(next)
  }

  if (authorization !== "authorized") {
    return (
      <main className="sf-wrap sf-closed" style={{ maxWidth: "calc(480px + 2 * var(--sf-gutter))" }}>
        <p className="sf-label">{brandName}</p>
        <h1 className="sf-h1">Unlock kiosk</h1>
        {authorization === "checking" ? (
          <p role="status" className="sf-text-2">Checking this kiosk…</p>
        ) : authorization === "unconfigured" ? (
          <Banner tone="bad" title="Kiosk isn’t configured">
            Set KIOSK_ORGANIZATION_ID and a KIOSK_API_TOKEN of at least 32 characters, then reload.
          </Banner>
        ) : (
          <form className="sf-form" onSubmit={handleUnlock}>
            <label className="sf-field" htmlFor="kiosk-token">Kiosk credential
              <input
                id="kiosk-token"
                type="password"
                value={unlockToken}
                onChange={(event) => setUnlockToken(event.target.value)}
                minLength={32}
                maxLength={512}
                autoComplete="off"
                required
              />
              <small>Exchanged for a 12-hour kiosk session. Not stored in the browser.</small>
            </label>
            {unlockError ? <Banner tone="bad">{unlockError}</Banner> : null}
            <button type="submit" className="sf-btn" data-size="lg" data-block disabled={isUnlocking}>
              {isUnlocking ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        )}
      </main>
    )
  }

  return (
    <div className="sf-kiosk">
      {checkInResult ? (
        <div className="sf-kiosk-result" data-tone={checkInResult.success ? "ok" : "bad"} role="alert">
          <div>
            {checkInResult.success ? (
              <>
                <Check aria-hidden="true" strokeWidth={3} />
                <h2>Welcome in</h2>
                <p>{checkInResult.memberName}</p>
                {checkInResult.membershipTier ? <p style={{ opacity: 0.85 }}>{checkInResult.membershipTier}</p> : null}
                {typeof checkInResult.classCreditsRemaining === "number" ? <p style={{ fontSize: "1rem", opacity: 0.85 }}>{formatCredits(checkInResult.classCreditsRemaining)}</p> : null}
              </>
            ) : (
              <>
                <X aria-hidden="true" strokeWidth={3} />
                <h2>Not checked in</h2>
                <p>{checkInResult.error}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <header className="sf-kiosk-bar">
        <div className="sf-stack" data-gap="sm" style={{ gap: 0 }}>
          <p className="sf-label">{brandName}</p>
          <h1 className="sf-h3">Check-in</h1>
        </div>
        <p className="sf-meta">Resets after 60 seconds idle</p>
      </header>

      <div className="sf-kiosk-main">
        <main className="sf-kiosk-panel">
          <div className="sf-seg" role="group" aria-label="Check-in method">
            <button type="button" aria-pressed={mode === "scan"} onClick={() => switchMode("scan")}>Scan code</button>
            <button type="button" aria-pressed={mode === "search"} onClick={() => switchMode("search")}>Find member</button>
            <button type="button" aria-pressed={mode === "guest"} onClick={() => switchMode("guest")}>Guest</button>
          </div>

          {notice ? <Banner tone="bad">{notice}</Banner> : null}

          {mode === "scan" ? (
            <section className="sf-card" aria-labelledby="kiosk-scan">
              <h2 id="kiosk-scan" className="sf-h2">Scan member code</h2>
              <label className="sf-field" htmlFor="qr-payload">Code
                <input
                  id="qr-payload"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQrSubmit()}
                  placeholder="Scan or paste"
                  autoFocus
                />
                <small>Codes rotate every 30 seconds. Expired codes are rejected.</small>
              </label>
              <div className="sf-actions">
                <button type="button" onClick={handleQrSubmit} disabled={isSubmittingScan} className="sf-btn" data-variant="accent" data-size="lg">
                  {isSubmittingScan ? "Checking in…" : "Check in"}
                </button>
                <button type="button" className="sf-btn" data-variant="secondary" data-size="lg" onClick={() => setScanValue("")}>Clear</button>
              </div>
            </section>
          ) : null}

          {mode === "search" ? (
            <section className="sf-card" aria-labelledby="kiosk-search">
              <h2 id="kiosk-search" className="sf-h2">Find member</h2>
              <div className="sf-row" style={{ alignItems: "end" }}>
                <label className="sf-field" htmlFor="kiosk-member-search" style={{ flex: "1 1 18rem" }}>Name, email or phone
                  <input
                    id="kiosk-member-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleMemberSearch()}
                    autoFocus
                  />
                </label>
                <button type="button" onClick={handleMemberSearch} disabled={isSearching} className="sf-btn" data-size="lg">
                  {isSearching ? "Searching…" : "Search"}
                </button>
              </div>

              {searchResults.length > 0 ? (
                <div className="sf-stack" data-gap="sm">
                  {searchResults.map((member) => {
                    const accessAllowed = member.status === "active" && member.membershipStatus === "active"
                    return (
                      <button
                        key={member.id}
                        type="button"
                        disabled={!accessAllowed}
                        onClick={() => handleCheckInByMemberId(member.id)}
                        className="sf-member-result"
                      >
                        <span className="sf-titleline">
                          <strong className="sf-h3">{member.name}</strong>
                          <span className="sf-state" data-tone={accessAllowed ? "ok" : "low"}>{accessAllowed ? "Tap to check in" : "Front desk review"}</span>
                        </span>
                        <span className="sf-meta sf-break">{member.email}{member.phone ? ` · ${member.phone}` : ""}</span>
                        <span className="sf-list-plain">
                          <span className="sf-tag">Member {member.status}</span>
                          <span className="sf-tag">Membership {member.membershipStatus || "none"}</span>
                          {member.membershipTier ? <span className="sf-tag">{member.membershipTier}</span> : null}
                          <span className="sf-tag">{formatCredits(member.classCreditsRemaining)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="No results" />
              )}
            </section>
          ) : null}

          {mode === "guest" ? (
            <section className="sf-card" aria-labelledby="kiosk-guest">
              <h2 id="kiosk-guest" className="sf-h2">Guest check-in</h2>
              <div className="sf-form">
                <label className="sf-field" htmlFor="guest-name">Guest name
                  <input
                    id="guest-name"
                    value={guestForm.name}
                    onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="sf-field" htmlFor="guest-phone">Phone (optional)
                  <input
                    id="guest-phone"
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                    type="tel"
                    autoComplete="off"
                  />
                </label>
                <label className="sf-field" htmlFor="guest-host">Host member (optional)
                  <input
                    id="guest-host"
                    value={guestForm.hostMember}
                    onChange={(e) => setGuestForm({ ...guestForm, hostMember: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <button type="button" onClick={handleGuestCheckIn} disabled={isSubmittingGuest} className="sf-btn" data-variant="accent" data-size="lg" data-block>
                  {isSubmittingGuest ? "Checking in…" : "Check in guest"}
                </button>
              </div>
            </section>
          ) : null}
        </main>

        <aside className="sf-panel" aria-labelledby="kiosk-recent">
          <h2 id="kiosk-recent" className="sf-h3">Recent</h2>
          {recentCheckIns.length === 0 ? (
            <p className="sf-text-2">None this session</p>
          ) : (
            <ul className="sf-bookings">
              {recentCheckIns.map((checkIn) => (
                <li key={checkIn.id} className="sf-stack" data-gap="sm" style={{ gap: 2, borderBottom: "1px solid var(--sf-line)", paddingBlock: 12 }}>
                  <div className="sf-row" data-between>
                    <strong>{checkIn.memberName}</strong>
                    <span className="sf-meta sf-num">{checkIn.time}</span>
                  </div>
                  {checkIn.membershipTier ? <span className="sf-meta">{checkIn.membershipTier}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
