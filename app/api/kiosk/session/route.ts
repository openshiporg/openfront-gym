import { NextRequest, NextResponse } from "next/server"
import {
  createKioskSessionValue,
  isKioskConfigured,
  isKioskRequestAuthorized,
  kioskSessionCookieOptions,
  KIOSK_SESSION_COOKIE,
} from "@/features/platform/kiosk"
import { authorizeKioskCredentialGraphQL } from "@/features/platform/kiosk/graphql"

export async function GET(request: NextRequest) {
  if (!isKioskConfigured()) {
    return NextResponse.json(
      { authorized: false, configured: false, error: "Kiosk credentials are not configured" },
      { status: 503 },
    )
  }
  const authorized = isKioskRequestAuthorized(request)
  return NextResponse.json({ authorized, configured: true }, { status: authorized ? 200 : 401 })
}

export async function POST(request: NextRequest) {
  if (!isKioskConfigured()) {
    return NextResponse.json(
      { authorized: false, configured: false, error: "Kiosk credentials are not configured" },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const token = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).token
    : null
  if (typeof token !== "string" || token.length > 512) {
    return NextResponse.json({ authorized: false, configured: true, error: "Kiosk credential is invalid" }, { status: 401 })
  }
  try {
    await authorizeKioskCredentialGraphQL(token)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kiosk credential is invalid"
    const status = /Too many/i.test(message) ? 429 : 401
    return NextResponse.json({ authorized: false, configured: true, error: message }, { status })
  }

  const response = NextResponse.json({ authorized: true, configured: true })
  response.cookies.set(KIOSK_SESSION_COOKIE, createKioskSessionValue(), kioskSessionCookieOptions())
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false, configured: isKioskConfigured() })
  response.cookies.set(KIOSK_SESSION_COOKIE, "", {
    ...kioskSessionCookieOptions(),
    maxAge: 0,
  })
  return response
}
