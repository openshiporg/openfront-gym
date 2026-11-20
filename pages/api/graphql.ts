import { keystoneContext } from '../../features/keystone/context'
import { createYoga } from "graphql-yoga";
import { gymGraphqlAdmissionPlugin } from "../../features/keystone/security/graphql-limits";
import { graphqlListPathMultiplierPlugin } from "../../features/keystone/security/graphql-query-cost";
import { suspendedTenantPlugin } from "../../features/keystone/security/tenant-status";
import { gymMaskedErrors } from "../../features/keystone/security/graphql-errors";
import { createSignInRateLimitPlugin } from "../../features/keystone/security/signin-rate-limit";

const signInRateLimitPlugin = createSignInRateLimitPlugin(() => keystoneContext.prisma);
// @ts-ignore
import processRequest from "graphql-upload/processRequest.js";
import { type NextApiRequest, type NextApiResponse } from 'next'
import {
  GraphqlRequestBodyTooLargeError,
  MAX_GRAPHQL_REQUEST_BODY_BYTES,
  readBoundedGraphqlRequestBody,
} from '../../features/keystone/lib/graphql-request-body'

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentLengthHeader = req.headers['content-length'];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return res.status(400).json({ error: 'Invalid request size' });
    }
    if (contentLength > MAX_GRAPHQL_REQUEST_BODY_BYTES) {
      return res.status(413).json({ error: 'Request is too large' });
    }
  }

  const contentType = req.headers['content-type'];
  if (req.method === 'POST' && typeof contentType === 'string' && contentType.toLowerCase().startsWith('multipart/form-data')) {
    // Image uploads (class, coach and site photos) only from a signed-in session that sends the
    // non-simple apollo-require-preflight header, so a cross-site form cannot post one. List and
    // field access still decide who may write each image.
    if (!isAllowedUploadRequest(req)) {
      return res.status(403).json({ error: 'File uploads need a signed-in staff session' });
    }
    try {
      req.body = await processRequest(req, res, {
        maxFieldSize: 1_000_000,
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 2,
      });
    } catch (error) {
      if (res.headersSent) return;
      const status = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : typeof error === 'object' && error !== null && 'status' in error
          ? Number(error.status)
          : 0;
      if (status === 413) return res.status(413).json({ error: 'Request is too large' });
      if (status === 400) return res.status(400).json({ error: 'Invalid multipart upload' });
      throw error;
    }
  } else if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      req.body = await readBoundedGraphqlRequestBody(req);
    } catch (error) {
      if (error instanceof GraphqlRequestBodyTooLargeError) {
        return res.status(413).json({ error: 'Request is too large' });
      }
      throw error;
    }
  }

  return createYoga({
    plugins: [gymGraphqlAdmissionPlugin, graphqlListPathMultiplierPlugin, suspendedTenantPlugin, signInRateLimitPlugin],
    maskedErrors: gymMaskedErrors,
    graphiql: false,
    graphqlEndpoint: "/api/graphql",
    // The dashboard uses same-origin requests; do not reflect arbitrary Origin values with session cookies.
    cors: false,
    schema: keystoneContext.graphql.schema,
    context: ({ req, res }: { req: any; res: any }) => {
      return keystoneContext.withRequest(req, res);
    },
    multipart: false,
  })(req, res);
}

function isAllowedUploadRequest(req: NextApiRequest) {
  if (!req.headers['apollo-require-preflight']) return false;
  if (!/(?:^|;\s*)keystonejs-session=/.test(String(req.headers.cookie || '')) && !/^Bearer\s+\S/i.test(String(req.headers.authorization || ''))) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers['x-forwarded-host'] || req.headers.host || '');
  } catch {
    return false;
  }
}
