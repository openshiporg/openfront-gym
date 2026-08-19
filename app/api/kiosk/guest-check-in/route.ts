import { NextRequest, NextResponse } from "next/server";
import { isKioskRequestAuthorized, readKioskJsonObject } from "@/features/platform/kiosk";
import { executeKioskGraphQL } from "@/features/platform/kiosk/graphql";

export async function POST(request: NextRequest) {
  if (!isKioskRequestAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Kiosk authorization required" }, { status: 401 });
  }
  try {
    const body = await readKioskJsonObject(request);
    if (!body) return NextResponse.json({ success: false, error: "Invalid guest check-in request" }, { status: 400 });
    for (const field of ["name", "phone", "hostMember", "idempotencyKey"] as const) {
      if (body[field] != null && typeof body[field] !== "string") {
        return NextResponse.json({ success: false, error: `${field} must be a string` }, { status: 400 });
      }
    }
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const hostMember = String(body.hostMember || "").trim();
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!name || name.length > 120 || phone.length > 40 || hostMember.length > 120 || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
      return NextResponse.json({ success: false, error: "Guest details are invalid or too long" }, { status: 400 });
    }
    const data = await executeKioskGraphQL<{ kioskRecordGuestCheckIn: Record<string, unknown> }>(`
      mutation KioskGuestCheckIn($name: String!, $phone: String, $hostMember: String, $idempotencyKey: String!, $organizationId: ID!, $credential: String!) {
        kioskRecordGuestCheckIn(
          name: $name
          phone: $phone
          hostMember: $hostMember
          idempotencyKey: $idempotencyKey
          organizationId: $organizationId
          credential: $credential
        ) { success checkInId guestName checkInTime }
      }
    `, { name, phone: phone || null, hostMember: hostMember || null, idempotencyKey });
    return NextResponse.json(data.kioskRecordGuestCheckIn);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Guest check-in failed" }, { status: 400 });
  }
}
