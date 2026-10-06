import type { IncomingMessage } from 'node:http';

export const MAX_GRAPHQL_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

type RawBodyReader = (
  request: IncomingMessage,
  options: { limit: number },
) => Promise<Buffer>;

// Reuse the raw-body reader shipped with this pinned Next version.
const readRawBody = require('next/dist/compiled/raw-body') as RawBodyReader;

export class GraphqlRequestBodyTooLargeError extends Error {
  constructor() {
    super('GraphQL request body exceeds the configured limit');
    this.name = 'GraphqlRequestBodyTooLargeError';
  }
}

function isEntityTooLargeError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
}

export async function readBoundedGraphqlRequestBody(
  request: IncomingMessage,
  maxBytes = MAX_GRAPHQL_REQUEST_BODY_BYTES,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('GraphQL request body limit must be a non-negative safe integer');
  }

  try {
    return await readRawBody(request, { limit: maxBytes });
  } catch (error) {
    if (isEntityTooLargeError(error)) throw new GraphqlRequestBodyTooLargeError();
    throw error;
  }
}
