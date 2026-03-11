"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Clock, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"

const QR_REFRESH_INTERVAL = 30000 // 30 seconds

export default function CheckInCodePage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQRCode = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/member/qr-code")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate QR code")
      }

      setQrDataUrl(data.qrDataUrl)
      setTimeLeft(30)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQRCode()

    const refreshInterval = setInterval(fetchQRCode, QR_REFRESH_INTERVAL)
    return () => clearInterval(refreshInterval)
  }, [fetchQRCode])

  useEffect(() => {
    if (timeLeft <= 0) return

    const countdown = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(countdown)
  }, [timeLeft])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <QrCode className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Your Check-In Code</h1>
          <p className="text-muted-foreground mt-2">
            Show this code at the gym entrance
          </p>
        </div>

        <div className="bg-card border rounded-2xl p-8 shadow-lg">
          <div className="relative">
            {isLoading ? (
              <div className="w-[280px] h-[280px] mx-auto flex items-center justify-center bg-muted rounded-lg animate-pulse">
                <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
              </div>
            ) : error ? (
              <div className="w-[280px] h-[280px] mx-auto flex flex-col items-center justify-center bg-destructive/10 rounded-lg text-center p-4">
                <p className="text-destructive font-medium mb-4">{error}</p>
                <Button onClick={fetchQRCode} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : qrDataUrl ? (
              <div className="relative">
                <img
                  src={qrDataUrl}
                  alt="Check-in QR Code"
                  className="w-[280px] h-[280px] mx-auto rounded-lg"
                />
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: `conic-gradient(from 0deg, hsl(var(--primary)) ${(timeLeft / 30) * 100}%, transparent ${(timeLeft / 30) * 100}%)`,
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'xor',
                    WebkitMaskComposite: 'xor',
                    padding: '3px',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              Refreshes in <span className="font-mono font-bold text-foreground">{timeLeft}s</span>
            </span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Code updates automatically for security
          </p>
          <Button
            onClick={fetchQRCode}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Now
          </Button>
        </div>
      </div>
    </div>
  )
}
