import { NextRequest, NextResponse } from 'next/server';
import { getDiscoveryErrorStatus, getDiscoveryTransportIdentity } from './auth';
import { executeDiscoveryGraphQL } from './graphql';
import { serializeClassCalendar } from './calendar';
export async function GET(request: NextRequest) {
  try {
    const identity = getDiscoveryTransportIdentity(request);
    const params = new URL(request.url).searchParams;
    const data = await executeDiscoveryGraphQL<{ discoveryClasses: { organizationId: string; classes: any[] } }>(`query ClassCalendar($credential: String!, $partner: String, $from: String, $to: String, $locationId: ID) { discoveryClasses(credential: $credential, partner: $partner, from: $from, to: $to, locationId: $locationId, limit: 200) }`, { ...identity, from: params.get('from'), to: params.get('to'), locationId: params.get('locationId') });
    return new NextResponse(serializeClassCalendar(data.discoveryClasses), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: 'Calendar could not be loaded. Check the discovery credential and date window.' }, { status: getDiscoveryErrorStatus(error) }); }
}
