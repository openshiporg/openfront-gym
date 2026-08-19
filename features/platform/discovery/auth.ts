import { NextRequest } from 'next/server';

export class DiscoveryAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DiscoveryAuthError';
    this.status = status;
  }
}

export function getDiscoveryErrorStatus(error: unknown) {
  if (error instanceof DiscoveryAuthError) return error.status;
  if (error instanceof Error && /Unauthorized|authorization/i.test(error.message)) return 401;
  if (error instanceof Error && /not configured|required scope/i.test(error.message)) return 503;
  if (error instanceof Error && /Too many/i.test(error.message)) return 429;
  return 400;
}

export function getDiscoveryTransportIdentity(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const credential = request.headers.get('x-discovery-api-key')?.trim() || bearerToken;
  if (!credential || credential.length > 512) throw new DiscoveryAuthError('Discovery authorization is required.', 401);
  return {
    credential,
    partner: request.headers.get('x-discovery-partner')?.trim().slice(0, 120) || '',
  };
}
