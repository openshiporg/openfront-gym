import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "graphql";
import { createSignInRateLimitPlugin, sensitiveAuthenticationAccounts, SIGN_IN_LIMIT } from "../features/keystone/security/signin-rate-limit";
import { requestClientSource, railwayEdgeSource } from "../lib/clientSource";

function withRailway(value: string | undefined, run: () => Promise<void> | void) {
  const previous = process.env.RAILWAY_ENVIRONMENT;
  if (value === undefined) delete process.env.RAILWAY_ENVIRONMENT;
  else process.env.RAILWAY_ENVIRONMENT = value;
  return Promise.resolve(run()).finally(() => {
    if (previous === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = previous;
  });
}

/** In-memory stand-in for the AuthRateLimitBucket table used by consumeAuthAttempt. */
function memoryPrisma() {
  const rows = new Map<string, { key: string; count: number; resetAt: Date }>();
  const bucket = {
    findUnique: async ({ where }: any) => rows.get(where.key) ?? null,
    deleteMany: async () => ({ count: 0 }),
    upsert: async ({ where, create }: any) => { rows.set(where.key, { ...create }); return create; },
    update: async ({ where, data }: any) => { const row = rows.get(where.key)!; row.count += data.count.increment; return row; },
  };
  const client: any = { authRateLimitBucket: bucket, $queryRaw: async () => [{ locked: true }] };
  client.$transaction = async (fn: any) => fn(client);
  return client;
}

const SIGN_IN = parse(`mutation($e: String!, $p: String!) { authenticateUserWithPassword(email: $e, password: $p) { __typename } }`);
const req = (realIp: string, peer = "100.64.0.7") => ({ headers: { "x-real-ip": realIp }, socket: { remoteAddress: peer } });

async function attempt(plugin: any, request: any, email: string) {
  try {
    await plugin.onExecute({ args: { document: SIGN_IN, variableValues: { e: email, p: "x" }, contextValue: { req: request } } });
    return "ok";
  } catch (error: any) {
    return error.extensions?.code ?? error.message;
  }
}

test("sign-in is refused after the limit for one client and account, even across rotating edge peers", () => withRailway("production", async () => {
  const prisma = memoryPrisma();
  const plugin = createSignInRateLimitPlugin(() => prisma);
  const results: string[] = [];
  for (let i = 0; i < SIGN_IN_LIMIT + 2; i++) results.push(await attempt(plugin, req("198.51.100.4", `100.64.0.${i + 1}`), "Member@Example.com"));
  assert.deepEqual(results.slice(0, SIGN_IN_LIMIT), Array(SIGN_IN_LIMIT).fill("ok"));
  assert.deepEqual(results.slice(SIGN_IN_LIMIT), ["RATE_LIMITED", "RATE_LIMITED"]);
  // A stranger at another address is not locked out of the same account, nor another account.
  assert.equal(await attempt(plugin, req("198.51.100.5"), "member@example.com"), "ok");
  assert.equal(await attempt(plugin, req("198.51.100.4"), "other@example.com"), "ok");
}));

test("several sign-in fields in one request are refused; other operations are untouched", async () => {
  const doc = parse(`mutation { a: authenticateUserWithPassword(email: "a@x.io", password: "1") { __typename } b: authenticateUserWithPassword(email: "b@x.io", password: "1") { __typename } }`);
  assert.deepEqual(sensitiveAuthenticationAccounts(doc), ["a@x.io", "b@x.io"]);
  const plugin: any = createSignInRateLimitPlugin(() => { throw new Error("must not touch storage"); });
  await assert.rejects(plugin.onExecute({ args: { document: doc, variableValues: {}, contextValue: { req: req("1.1.1.1") } } }), /one sign-in/);
  await plugin.onExecute({ args: { document: parse("{ authenticatedItem { __typename } }"), variableValues: {}, contextValue: {} } });
});

test("the Railway edge X-Real-IP keys the source; loopback, malformed values and non-Railway hosts do not", () => withRailway("production", async () => {
  assert.equal(requestClientSource(req("198.51.100.4", "100.64.0.7")), "198.51.100.4");
  assert.equal(requestClientSource({ headers: { "x-real-ip": "198.51.100.4", "x-forwarded-for": "203.0.113.1" }, socket: { remoteAddress: "100.64.0.9" } }), "198.51.100.4");
  assert.equal(railwayEdgeSource({ "x-real-ip": "198.51.100.4" }, "127.0.0.1"), "");
  assert.equal(railwayEdgeSource({ "x-real-ip": "1.2.3.4, 5.6.7.8" }, "100.64.0.7"), "");
  assert.equal(railwayEdgeSource({ "x-real-ip": "nope" }, "100.64.0.7"), "");
  await withRailway(undefined, () => {
    assert.equal(railwayEdgeSource({ "x-real-ip": "198.51.100.4" }, "100.64.0.7"), "");
  });
}));
