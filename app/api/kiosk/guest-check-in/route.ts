import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@keystone-6/core/context"
import config from "@/keystone"
import * as PrismaModule from ".prisma/client"

export async function POST(request: NextRequest) {
  try {
    const { name, phone, hostMember } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Guest name is required" },
        { status: 400 }
      )
    }

    const context = getContext(config, PrismaModule).sudo()

    let hostMemberId: string | undefined

    if (hostMember) {
      const members = await context.query.Member.findMany({
        where: {
          OR: [
            { user: { name: { contains: hostMember, mode: "insensitive" } } },
            { user: { email: { contains: hostMember, mode: "insensitive" } } },
          ],
        },
        take: 1,
        query: "id",
      })

      if (members.length > 0) {
        hostMemberId = members[0].id
      }
    }

    const checkIn = await context.query.CheckIn.createOne({
      data: {
        isGuest: true,
        guestName: name.trim(),
        method: "manual",
        membershipValidated: false,
        validationNotes: phone ? `Guest phone: ${phone}. ${hostMemberId ? 'Invited by member.' : ''}` : undefined,
        ...(hostMemberId ? { member: { connect: { id: hostMemberId } } } : {}),
      },
      query: "id checkInTime guestName",
    })

    return NextResponse.json({
      success: true,
      checkInId: checkIn.id,
      guestName: checkIn.guestName,
      checkInTime: checkIn.checkInTime,
    })
  } catch (error) {
    console.error("Guest check-in error:", error)
    return NextResponse.json(
      { success: false, error: "Guest check-in failed. Please try again." },
      { status: 500 }
    )
  }
}
