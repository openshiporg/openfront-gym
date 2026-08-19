import { NextRequest, NextResponse } from "next/server";
import { isKioskRequestAuthorized, readKioskJsonObject } from "@/features/platform/kiosk";
import { executeKioskGraphQL } from "@/features/platform/kiosk/graphql";

export async function POST(request: NextRequest) {
  if (!isKioskRequestAuthorized(request)) {
    return NextResponse.json({ error: "Kiosk authorization required", members: [] }, { status: 401 });
  }
  try {
    const body = await readKioskJsonObject(request);
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 2) return NextResponse.json({ members: [] });
    if (query.length > 100) return NextResponse.json({ error: "Search query is too long", members: [] }, { status: 400 });
    const data = await executeKioskGraphQL<{ kioskSearchMembers: unknown[] }>(`
      query KioskSearch($query: String!, $organizationId: ID!, $credential: String!) {
        kioskSearchMembers(query: $query, organizationId: $organizationId, credential: $credential) {
          id name email phone status membershipTier membershipStatus classCreditsRemaining
        }
      }
    `, { query });
    return NextResponse.json({ members: data.kioskSearchMembers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed", members: [] }, { status: 400 });
  }
}
