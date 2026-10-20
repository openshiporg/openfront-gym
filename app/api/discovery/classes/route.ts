import { NextRequest, NextResponse } from 'next/server';
import { getDiscoveryErrorStatus, getDiscoveryTransportIdentity } from '@/features/platform/discovery/auth';
import { executeDiscoveryGraphQL } from '@/features/platform/discovery/graphql';

export async function GET(request: NextRequest) {
  try {
    const identity = getDiscoveryTransportIdentity(request);
    const params = new URL(request.url).searchParams;
    const limitRaw = params.get('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
    const skipRaw = params.get('skip');
    const skip = skipRaw ? Number.parseInt(skipRaw, 10) : null;
    const data = await executeDiscoveryGraphQL<{ discoveryClasses: Record<string, unknown> }>(`
      query DiscoveryClasses(
        $credential: String!
        $partner: String
        $from: String
        $to: String
        $dayOfWeek: String
        $locationId: ID
        $locationName: String
        $limit: Int
        $skip: Int
      ) {
        discoveryClasses(
          credential: $credential
          partner: $partner
          from: $from
          to: $to
          dayOfWeek: $dayOfWeek
          locationId: $locationId
          locationName: $locationName
          limit: $limit
          skip: $skip
        )
      }
    `, {
      ...identity,
      from: params.get('from'),
      to: params.get('to'),
      dayOfWeek: params.get('dayOfWeek'),
      locationId: params.get('locationId'),
      locationName: params.get('locationName'),
      limit: Number.isInteger(limit) ? limit : null,
      skip: Number.isInteger(skip) ? skip : null,
    });
    return NextResponse.json(data.discoveryClasses);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load discovery classes.' },
      { status: getDiscoveryErrorStatus(error) },
    );
  }
}
