import { NextRequest, NextResponse } from 'next/server';
import { getDiscoveryErrorStatus, getDiscoveryTransportIdentity } from './auth';
import { executeDiscoveryGraphQL } from './graphql';
import { serializeClassCalendar } from './calendar';
export async function GET(request: NextRequest) {
  try {
    const identity = getDiscoveryTransportIdentity(request);
    const params = new URL(request.url).searchParams;
    // The calendar covers the whole window: pages are read until the feed reports no more
    // (bounded at 1,000 sessions).
    let organizationId = '';
    const classes: any[] = [];
    for (let skip = 0, page = 0; page < 5; page += 1) {
      const result = await executeDiscoveryGraphQL<{ discoveryClasses: { organizationId: string; classes: any[]; hasMore?: boolean; nextSkip?: number | null } }>(`query ClassCalendar($credential: String!, $partner: String, $from: String, $to: String, $locationId: ID, $skip: Int) { discoveryClasses(credential: $credential, partner: $partner, from: $from, to: $to, locationId: $locationId, limit: 200, skip: $skip) }`, { ...identity, from: params.get('from'), to: params.get('to'), locationId: params.get('locationId'), skip });
      const feed = result.discoveryClasses;
      organizationId = feed.organizationId;
      classes.push(...feed.classes);
      if (!feed.hasMore || feed.nextSkip == null) break;
      skip = feed.nextSkip;
    }
    return new NextResponse(serializeClassCalendar({ organizationId, classes }), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: 'Calendar could not be loaded. Check the discovery credential and date window.' }, { status: getDiscoveryErrorStatus(error) }); }
}
