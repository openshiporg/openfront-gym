import { NextResponse } from "next/server"
import { keystoneContext } from "@/features/keystone/context"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await Promise.race([
      keystoneContext.prisma.$queryRaw`SELECT 1 AS ready`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("readiness timeout")), 3000)),
    ])
    return NextResponse.json(
      { status: "ready" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
