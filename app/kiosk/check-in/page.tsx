"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Check, X, QrCode, Search, User, AlertCircle, Clock, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

type CheckInResult = {
  success: boolean
  memberName?: string
  memberPhoto?: string
  membershipTier?: string
  error?: string
}

type RecentCheckIn = {
  id: string
  memberName: string
  time: string
  photo?: string
}

export default function KioskCheckInPage() {
  const [mode, setMode] = useState<"scan" | "search" | "guest">("scan")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([])
  const [guestForm, setGuestForm] = useState({ name: "", phone: "", hostMember: "" })
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<any>(null)

  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout

    const resetTimer = () => {
      clearTimeout(inactivityTimer)
      inactivityTimer = setTimeout(() => {
        setMode("scan")
        setSearchQuery("")
        setSearchResults([])
        setCheckInResult(null)
        setGuestForm({ name: "", phone: "", hostMember: "" })
      }, 60000) // 1 minute inactivity
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
    if (checkInResult) {
      const timer = setTimeout(() => setCheckInResult(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [checkInResult])

  const handleMemberSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch("/api/kiosk/search-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      })

      const data = await response.json()
      setSearchResults(data.members || [])
    } catch (error) {
      toast.error("Search failed. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleCheckIn = async (memberId: string) => {
    try {
      const response = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      })

      const data = await response.json()

      if (data.success) {
        setCheckInResult({
          success: true,
          memberName: data.memberName,
          memberPhoto: data.memberPhoto,
          membershipTier: data.membershipTier,
        })

        setRecentCheckIns((prev) => [
          {
            id: data.checkInId,
            memberName: data.memberName,
            time: new Date().toLocaleTimeString(),
            photo: data.memberPhoto,
          },
          ...prev.slice(0, 9),
        ])

        setSearchQuery("")
        setSearchResults([])
      } else {
        setCheckInResult({
          success: false,
          error: data.error || "Check-in failed",
        })
      }
    } catch (error) {
      setCheckInResult({
        success: false,
        error: "Network error. Please try again.",
      })
    }
  }

  const handleGuestCheckIn = async () => {
    if (!guestForm.name.trim()) {
      toast.error("Please enter guest name")
      return
    }

    try {
      const response = await fetch("/api/kiosk/guest-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guestForm),
      })

      const data = await response.json()

      if (data.success) {
        setCheckInResult({
          success: true,
          memberName: `Guest: ${guestForm.name}`,
        })

        setRecentCheckIns((prev) => [
          {
            id: data.checkInId,
            memberName: `Guest: ${guestForm.name}`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ])

        setGuestForm({ name: "", phone: "", hostMember: "" })
        setMode("scan")
      } else {
        toast.error(data.error || "Guest check-in failed")
      }
    } catch (error) {
      toast.error("Network error. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Main Area */}
      <div className="flex-1 p-8 flex flex-col">
        {/* Check-in Result Overlay */}
        {checkInResult && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center ${
              checkInResult.success ? "bg-green-500/90" : "bg-red-500/90"
            }`}
          >
            <div className="text-center text-white space-y-6">
              {checkInResult.success ? (
                <>
                  <div className="w-32 h-32 mx-auto bg-white rounded-full flex items-center justify-center">
                    <Check className="w-20 h-20 text-green-500" strokeWidth={4} />
                  </div>
                  <div>
                    <h2 className="text-4xl font-bold mb-2">Welcome!</h2>
                    <p className="text-2xl">{checkInResult.memberName}</p>
                    {checkInResult.membershipTier && (
                      <p className="text-xl opacity-80">{checkInResult.membershipTier} Member</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-32 h-32 mx-auto bg-white rounded-full flex items-center justify-center">
                    <X className="w-20 h-20 text-red-500" strokeWidth={4} />
                  </div>
                  <div>
                    <h2 className="text-4xl font-bold mb-2">Access Denied</h2>
                    <p className="text-xl">{checkInResult.error}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex gap-4 mb-8">
          <Button
            variant={mode === "scan" ? "default" : "outline"}
            onClick={() => setMode("scan")}
            size="lg"
            className="flex-1 h-16 text-xl gap-3"
          >
            <QrCode className="w-6 h-6" />
            Scan QR Code
          </Button>
          <Button
            variant={mode === "search" ? "default" : "outline"}
            onClick={() => setMode("search")}
            size="lg"
            className="flex-1 h-16 text-xl gap-3"
          >
            <Search className="w-6 h-6" />
            Search Member
          </Button>
          <Button
            variant={mode === "guest" ? "default" : "outline"}
            onClick={() => setMode("guest")}
            size="lg"
            className="flex-1 h-16 text-xl gap-3"
          >
            <UserPlus className="w-6 h-6" />
            Guest Check-In
          </Button>
        </div>

        {/* Mode Content */}
        <div className="flex-1 flex items-center justify-center">
          {mode === "scan" && (
            <div className="text-center space-y-8">
              <div className="w-80 h-80 mx-auto border-4 border-dashed border-muted-foreground/50 rounded-2xl flex items-center justify-center bg-muted/30">
                <div className="text-center text-muted-foreground">
                  <QrCode className="w-20 h-20 mx-auto mb-4" />
                  <p className="text-xl font-medium">Scan your QR code</p>
                  <p className="text-sm">Hold your phone to the camera</p>
                </div>
              </div>
              <p className="text-muted-foreground">
                Open the Gym app and show your check-in QR code
              </p>
            </div>
          )}

          {mode === "search" && (
            <div className="w-full max-w-2xl space-y-6">
              <div className="flex gap-4">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMemberSearch()}
                  placeholder="Search by name, email, or phone..."
                  className="h-16 text-xl px-6"
                  autoFocus
                />
                <Button
                  onClick={handleMemberSearch}
                  disabled={isSearching}
                  size="lg"
                  className="h-16 px-8 text-xl"
                >
                  {isSearching ? "..." : "Search"}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleCheckIn(member.id)}
                      className="w-full flex items-center gap-4 p-4 bg-card border rounded-xl hover:bg-muted transition-colors text-left"
                    >
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        {member.photo ? (
                          <img
                            src={member.photo}
                            alt=""
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        ) : (
                          <User className="w-8 h-8 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold">{member.name}</h3>
                        <p className="text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            member.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {member.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "guest" && (
            <div className="w-full max-w-lg space-y-6">
              <div className="text-center mb-8">
                <UserPlus className="w-16 h-16 mx-auto text-primary mb-4" />
                <h2 className="text-2xl font-bold">Guest Check-In</h2>
                <p className="text-muted-foreground">Enter guest information</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Guest Name *</label>
                  <Input
                    value={guestForm.name}
                    onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                    placeholder="Full name"
                    className="h-14 text-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number</label>
                  <Input
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="h-14 text-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Host Member (optional)</label>
                  <Input
                    value={guestForm.hostMember}
                    onChange={(e) => setGuestForm({ ...guestForm, hostMember: e.target.value })}
                    placeholder="Member who invited this guest"
                    className="h-14 text-lg"
                  />
                </div>
              </div>

              <Button
                onClick={handleGuestCheckIn}
                size="lg"
                className="w-full h-16 text-xl"
              >
                Complete Guest Check-In
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Check-ins Sidebar */}
      <div className="w-80 bg-muted/50 border-l p-6">
        <div className="flex items-center gap-2 mb-6">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">Recent Check-Ins</h3>
        </div>

        {recentCheckIns.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No recent check-ins
          </p>
        ) : (
          <div className="space-y-3">
            {recentCheckIns.map((checkIn) => (
              <div
                key={checkIn.id}
                className="flex items-center gap-3 p-3 bg-background rounded-lg"
              >
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  {checkIn.photo ? (
                    <img
                      src={checkIn.photo}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{checkIn.memberName}</p>
                  <p className="text-xs text-muted-foreground">{checkIn.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
