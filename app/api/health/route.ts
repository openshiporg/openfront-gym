import { NextResponse } from "next/server"
import { keystoneContext } from "@/features/keystone/context"

export const dynamic = "force-dynamic"

export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      keystoneContext.prisma.$queryRaw`SELECT 1 AS ready`,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("readiness timeout")), 3000)
      }),
    ])
    // Keystone 6.5.1's Prisma extension returns GraphQLError values on failure.
    // Awaiting the operation alone therefore does not establish DB readiness.
    if (result instanceof Error) throw result
    if (
      !Array.isArray(result) ||
      result.length !== 1 ||
      !result[0] ||
      typeof result[0] !== "object" ||
      (result[0] as { ready?: unknown }).ready !== 1
    ) throw new Error("readiness query returned an unexpected result")
    return NextResponse.json(
      { status: "ready" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
