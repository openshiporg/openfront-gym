import { type NextRequest } from "next/server"

export type KioskJsonObject = Record<string, unknown>

export function isKioskJsonObject(value: unknown): value is KioskJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readKioskJsonObject(request: NextRequest): Promise<KioskJsonObject | null> {
  const body = await request.json().catch(() => null)
  return isKioskJsonObject(body) ? body : null
}
