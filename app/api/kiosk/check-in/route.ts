import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@keystone-6/core/context"
import config from "@/keystone"
import * as PrismaModule from ".prisma/client"

export async function POST(request: NextRequest) {
  try {
    const { memberId, qrCode } = await request.json()

    if (!memberId && !qrCode) {
      return NextResponse.json(
        { success: false, error: "Member ID or QR code required" },
        { status: 400 }
      )
    }

    const context = getContext(config, PrismaModule).sudo()

    let resolvedMemberId = memberId

    if (qrCode) {
      const { validateQRCode } = await import("@/lib/qrcode")
      const validation = validateQRCode(qrCode)

      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          error: validation.error,
        })
      }

      resolvedMemberId = validation.memberId
    }

    const member = await context.query.Member.findOne({
      where: { id: resolvedMemberId },
      query: `
        id
        status
        user {
          id
          name
          email
        }
        currentMembershipTier {
          id
          name
        }
        subscriptions(where: { status: { equals: "active" } }) {
          id
          status
        }
      `,
    })

    if (!member) {
      return NextResponse.json({
        success: false,
        error: "Member not found",
      })
    }

    if (member.status !== "active") {
      return NextResponse.json({
        success: false,
        error: `Membership ${member.status}. Please visit the front desk.`,
      })
    }

    if (!member.subscriptions || member.subscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No active subscription. Please renew your membership.",
      })
    }

    const checkIn = await context.query.CheckIn.createOne({
      data: {
        member: { connect: { id: resolvedMemberId } },
        method: qrCode ? "qr_code" : "manual",
        membershipValidated: true,
      },
      query: "id checkInTime",
    })

    return NextResponse.json({
      success: true,
      checkInId: checkIn.id,
      memberName: member.user?.name,
      membershipTier: member.currentMembershipTier?.name,
      checkInTime: checkIn.checkInTime,
    })
  } catch (error) {
    console.error("Check-in error:", error)
    return NextResponse.json(
      { success: false, error: "Check-in failed. Please try again." },
      { status: 500 }
    )
  }
}
