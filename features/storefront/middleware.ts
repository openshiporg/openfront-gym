import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// Handles storefront routes for the gym app (the proxy's storefront hook, as in Restaurant).
// Gym storefront pages resolve their own session and returns; no region or cart routing.
export async function handleStorefrontRoutes(_request: NextRequest, _user: any | null) {
  return NextResponse.next();
}
