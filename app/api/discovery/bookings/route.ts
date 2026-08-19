import { NextRequest, NextResponse } from 'next/server';
import { getDiscoveryErrorStatus, getDiscoveryTransportIdentity } from '@/features/platform/discovery/auth';
import { executeDiscoveryGraphQL } from '@/features/platform/discovery/graphql';
import { readDiscoveryJsonObject, parseDiscoveryBookingRequest } from '@/features/platform/discovery/request';

export async function POST(request: NextRequest) {
  try {
    const identity = getDiscoveryTransportIdentity(request);
    const body = await readDiscoveryJsonObject(request);
    if (!body) return NextResponse.json({ error: 'Invalid discovery booking request.' }, { status: 400 });
    const parsed = parseDiscoveryBookingRequest(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const data = await executeDiscoveryGraphQL<{ discoveryBookClass: Record<string, unknown> }>(`
      mutation DiscoveryBookClass(
        $credential: String!
        $partner: String
        $classInstanceId: ID!
        $memberId: ID
        $memberEmail: String
      ) {
        discoveryBookClass(
          credential: $credential
          partner: $partner
          classInstanceId: $classInstanceId
          memberId: $memberId
          memberEmail: $memberEmail
        )
      }
    `, { ...identity, ...parsed.data });
    return NextResponse.json(data.discoveryBookClass);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to create discovery booking.' },
      { status: getDiscoveryErrorStatus(error) },
    );
  }
}
