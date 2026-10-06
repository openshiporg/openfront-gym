import { keystoneContext } from '../../features/keystone/context'
import { createYoga } from "graphql-yoga";
import { gymGraphqlAdmissionPlugin } from "../../features/keystone/security/graphql-limits";
import { graphqlListPathMultiplierPlugin } from "../../features/keystone/security/graphql-query-cost";
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
    plugins: [gymGraphqlAdmissionPlugin, graphqlListPathMultiplierPlugin],
    renderGraphiQL: () => {
      return `
        <!DOCTYPE html>
        <html lang="en">
          <body style="margin: 0; overflow-x: hidden; overflow-y: hidden">
          <div id="sandbox" style="height:100vh; width:100vw;"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
          new window.EmbeddedSandbox({
            target: "#sandbox",
            // Pass through your server href if you are embedding on an endpoint.
            // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
            initialEndpoint: window.location.href,
            hideCookieToggle: false,
            initialState: {
              includeCookies: true
            }
          });
          // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>
          </body>
        </html>`;
    },
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