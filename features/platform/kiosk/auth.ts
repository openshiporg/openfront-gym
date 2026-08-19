import { createHmac, timingSafeEqual } from "node:crypto"
import { type NextRequest } from "next/server"

const KIOSK_TOKEN_HEADER = "x-kiosk-token"
export const KIOSK_SESSION_COOKIE = "openfront-gym-kiosk"
export const KIOSK_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

function kioskApiToken() {
  const token = process.env.KIOSK_API_TOKEN?.trim()
  return token && token.length >= 32 ? token : null
}

export function getKioskOrganizationId() {
  const organizationId = process.env.KIOSK_ORGANIZATION_ID?.trim()
  return organizationId && organizationId.length > 0 ? organizationId : null
}

export function isKioskConfigured() {
  return Boolean(kioskApiToken() && getKioskOrganizationId())
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function isKioskTokenValid(suppliedToken: unknown) {
  const requiredToken = kioskApiToken()
  return Boolean(
    requiredToken &&
      typeof suppliedToken === "string" &&
      safeEqual(suppliedToken.trim(), requiredToken),
  )
}

function sessionSignature(expiresAt: number) {
  const token = kioskApiToken()
  const organizationId = getKioskOrganizationId()
  if (!token || !organizationId) return null
  return createHmac("sha256", token)
    .update(`kiosk-session:${organizationId}:${expiresAt}`)
    .digest("hex")
}

export function createKioskSessionValue(now = Date.now()) {
  if (!isKioskConfigured()) throw new Error("Kiosk credentials are not configured")
  const expiresAt = now + KIOSK_SESSION_MAX_AGE_SECONDS * 1000
  const signature = sessionSignature(expiresAt)
  if (!signature) throw new Error("Kiosk credentials are not configured")
  return `${expiresAt}.${signature}`
}

export function isKioskSessionValueValid(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return false
  const [expiresText, suppliedSignature, ...extra] = value.split(".")
  if (extra.length || !expiresText || !suppliedSignature) return false
  const expiresAt = Number(expiresText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false
  if (expiresAt > now + KIOSK_SESSION_MAX_AGE_SECONDS * 1000) return false
  const expectedSignature = sessionSignature(expiresAt)
  return Boolean(expectedSignature && safeEqual(suppliedSignature, expectedSignature))
}

export function isKioskRequestAuthorized(request: NextRequest) {
  if (!isKioskConfigured()) return false
  const suppliedToken = request.headers.get(KIOSK_TOKEN_HEADER)
  if (isKioskTokenValid(suppliedToken)) return true
  return isKioskSessionValueValid(request.cookies.get(KIOSK_SESSION_COOKIE)?.value)
}

export function kioskSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/kiosk",
    maxAge: KIOSK_SESSION_MAX_AGE_SECONDS,
  }
}
