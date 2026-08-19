import { NextRequest, NextResponse } from "next/server";
import { isKioskRequestAuthorized, readKioskJsonObject } from "@/features/platform/kiosk";
import { executeKioskGraphQL } from "@/features/platform/kiosk/graphql";

export async function POST(request: NextRequest) {
  if (!isKioskRequestAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Kiosk authorization required" }, { status: 401 });
  }
  try {
    const body = await readKioskJsonObject(request);
    if (!body) return NextResponse.json({ success: false, error: "Invalid check-in request" }, { status: 400 });
    for (const field of ["memberId", "qrCode", "locationId"] as const) {
      if (body[field] != null && typeof body[field] !== "string") {
        return NextResponse.json({ success: false, error: `${field} must be a string` }, { status: 400 });
      }
    }
    const memberId = String(body.memberId || "").trim();
    const qrCode = String(body.qrCode || "").trim();
    const locationId = String(body.locationId || "").trim();
    if ((!memberId && !qrCode) || memberId.length > 200 || locationId.length > 200 || qrCode.length > 4096) {
      return NextResponse.json({ success: false, error: "A valid member ID or QR code is required" }, { status: 400 });
    }
    const data = await executeKioskGraphQL<{ kioskRecordMemberCheckIn: Record<string, unknown> }>(`
      mutation KioskCheckIn($memberId: String, $qrCode: String, $locationId: String, $organizationId: ID!, $credential: String!) {
        kioskRecordMemberCheckIn(
          memberId: $memberId
          qrCode: $qrCode
          locationId: $locationId
          organizationId: $organizationId
          credential: $credential
        ) {
          success error checkInId memberName membershipTier checkInTime reused classCreditsRemaining
        }
      }
    `, { memberId: memberId || null, qrCode: qrCode || null, locationId: locationId || null });
    return NextResponse.json(data.kioskRecordMemberCheckIn);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Check-in failed" }, { status: 400 });
  }
}
