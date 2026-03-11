import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@keystone-6/core/context"
import config from "@/keystone"
import * as PrismaModule from ".prisma/client"

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || query.length < 2) {
      return NextResponse.json({ members: [] })
    }

    const context = getContext(config, PrismaModule).sudo()

    const members = await context.query.Member.findMany({
      where: {
        OR: [
          { user: { name: { contains: query, mode: "insensitive" } } },
          { user: { email: { contains: query, mode: "insensitive" } } },
          { phoneNumber: { contains: query } },
        ],
      },
      take: 10,
      query: `
        id
        status
        phoneNumber
        user {
          id
          name
          email
        }
        currentMembershipTier {
          id
          name
        }
      `,
    })

    return NextResponse.json({
      members: members.map((m: any) => ({
        id: m.id,
        name: m.user?.name || "Unknown",
        email: m.user?.email || "",
        phone: m.phoneNumber,
        status: m.status,
        membershipTier: m.currentMembershipTier?.name,
      })),
    })
  } catch (error) {
    console.error("Member search error:", error)
    return NextResponse.json(
      { error: "Search failed", members: [] },
      { status: 500 }
    )
  }
}
