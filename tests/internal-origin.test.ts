import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import { requestClientSource, verifiedInternalIdentity } from "../lib/clientSource";
import { signInternalClientIdentity } from "../features/keystone/security/internalIdentity";
import {
  clientSourceFromHeaders,
  createInternalGraphqlFetch,
  endUserSource,
  internalGraphqlEndpoint,
  internalIdentityHeaders,
  resolveInternalBaseUrl,
  tryLoopbackOrigin,
} from "../features/keystone/lib/internal-origin";

const SECRET = "a".repeat(40);
const PORT = String(4000 + 321);
const LOOPBACK = ["http://127.0.0.1", PORT].join(":");
const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  const restore = () => {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(restore);
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

const NO_INTERNAL = { INTERNAL_APP_URL: undefined, INTERNAL_GRAPHQL_URL: undefined, PORTLESS_TARGET_PORT: undefined };

test("server path: the internal origin is loopback on the process PORT", () => withEnv({ ...NO_INTERNAL, PORT, NEXTAUTH_URL: "https://club.test" }, () => {
  assert.equal(tryLoopbackOrigin(PORT), LOOPBACK);
  assert.equal(resolveInternalBaseUrl(), LOOPBACK);
  assert.equal(internalGraphqlEndpoint(), `${LOOPBACK}/api/graphql`);
}));

test("PORT unset or invalid: the public origin exactly as before, never a guessed port", () => withEnv({ ...NO_INTERNAL, NEXTAUTH_URL: "https://club.test" }, () => {
  for (const port of [undefined, "", "abc", "70000", "0"]) {
    withEnv({ PORT: port }, () => {
      assert.equal(tryLoopbackOrigin(port), null);
      assert.equal(resolveInternalBaseUrl(), "https://club.test");
    });
  }
}));

test("source is the end user real IP, never a shared constant", () => withEnv({ RAILWAY_ENVIRONMENT: "production" }, () => {
  assert.equal(clientSourceFromHeaders(h({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientSourceFromHeaders(h({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" })), "198.51.100.2");
  assert.equal(clientSourceFromHeaders(h({})), null);
  assert.equal(endUserSource(h({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(endUserSource(null), null);
}));

test("off Railway, forwarded headers are believed only under the existing trusted-proxy rule", () => withEnv({ RAILWAY_ENVIRONMENT: undefined, CLIENT_SOURCE_TRUST_PROXY: undefined }, () => {
  assert.equal(endUserSource(h({ "x-real-ip": "203.0.113.7" })), null);
  withEnv({ CLIENT_SOURCE_TRUST_PROXY: "true" }, () => {
    assert.equal(endUserSource(h({ "x-forwarded-for": "198.51.100.2, 203.0.113.9" })), "203.0.113.9");
  });
}));

test("two visitors' headers produce two different signed identities (nothing cached across visitors)", async () => {
  await withEnv({ ...NO_INTERNAL, PORT, SESSION_SECRET: SECRET, RAILWAY_ENVIRONMENT: "production" }, async () => {
    const seen: Headers[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init: any) => {
      seen.push(new Headers(init.headers));
      return new Response("{}");
    }) as typeof fetch;
    try {
      const { gymClient } = await import("../features/storefront/lib/config");
      // The storefront client reads next/headers per request; outside Next it has no source, so
      // drive the per-request fetch the client builds with two visitors' own headers instead.
      for (const ip of ["203.0.113.7", "198.51.100.44"]) {
        const f = createInternalGraphqlFetch(endUserSource(h({ "x-real-ip": ip })));
        await f(`${LOOPBACK}/api/graphql`, { method: "POST", body: "{}" });
      }
      assert.equal(typeof gymClient.request, "function");
    } finally {
      globalThis.fetch = original;
    }
    const [a, b] = seen.map((headers) => headers.get("x-openfront-client-identity"));
    assert.match(a || "", /^[a-f0-9]{64}$/);
    assert.match(b || "", /^[a-f0-9]{64}$/);
    assert.notEqual(a, b);
    const now = Date.now();
    const keys = seen.map((headers) => requestClientSource({ headers: Object.fromEntries(headers), socket: { remoteAddress: "127.0.0.1" } }, SECRET, now));
    assert.ok(keys.every((key) => key.startsWith("forwarded:")));
    assert.notEqual(keys[0], keys[1]);
  });
});

test("short secret, missing secret or missing source sends unsigned and never throws", () => {
  assert.deepEqual(internalIdentityHeaders("203.0.113.7", "short"), {});
  assert.deepEqual(internalIdentityHeaders("203.0.113.7", ""), {});
  assert.deepEqual(internalIdentityHeaders(null, SECRET), {});
});

test("internal fetch signs each loopback call, forwards cookies, and refuses other targets", async () => {
  await withEnv({ ...NO_INTERNAL, PORT, SESSION_SECRET: SECRET }, async () => {
    const original = globalThis.fetch;
    let seen: Headers | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      seen = new Headers(init.headers);
      return new Response("{}");
    }) as typeof fetch;
    try {
      const f = createInternalGraphqlFetch("203.0.113.7");
      await f(`${LOOPBACK}/api/graphql`, { method: "POST", headers: { cookie: "keystonejs-session=x" } });
      assert.equal(seen?.get("cookie"), "keystonejs-session=x");
      assert.match(seen?.get("x-openfront-client-identity") || "", /^[a-f0-9]{64}$/);
      await assert.rejects(() => f("https://evil.example/api/graphql", {}), /configured Gym endpoint/);
      await assert.rejects(() => f(`${LOOPBACK}/other`, {}), /configured Gym endpoint/);
      process.env.SESSION_SECRET = "short";
      await f(`${LOOPBACK}/api/graphql`, {});
      assert.equal(seen?.get("x-openfront-client-identity"), null);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("a public (non-loopback) internal origin never receives the signed identity", async () => {
  await withEnv({ INTERNAL_APP_URL: "https://club.test", PORT, SESSION_SECRET: SECRET }, async () => {
    const original = globalThis.fetch;
    let seen: Headers | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      seen = new Headers(init.headers);
      return new Response("{}");
    }) as typeof fetch;
    try {
      await createInternalGraphqlFetch("203.0.113.7")("https://club.test/api/graphql", { method: "POST" });
      assert.equal(seen?.get("x-openfront-client-identity"), null);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("browser never signs: the dashboard target falls back to the public endpoint when window exists", async () => {
  (globalThis as any).window = { location: { origin: "https://club.test" } };
  try {
    const { getServerGraphQLTarget } = await import("../features/dashboard/lib/getBaseUrl");
    const target = await getServerGraphQLTarget();
    assert.equal(target.endpoint, "https://club.test/api/graphql");
    assert.equal(target.fetch, undefined);
  } finally {
    delete (globalThis as any).window;
  }
});

function signedHeaders(now: number, source = "203.0.113.7", secret = SECRET) {
  const signed = signInternalClientIdentity(source, secret, now)!;
  return {
    signed,
    headers: {
      "x-openfront-client-identity": signed.identity,
      "x-openfront-client-timestamp": signed.timestamp,
      "x-openfront-client-signature": signed.signature,
    } as Record<string, string>,
  };
}

const req = (headers: Record<string, string>, remoteAddress?: string) => ({ headers, socket: { remoteAddress } });

test("SECURITY (a) a valid signature from a loopback socket becomes the limiter key", () => {
  const now = Date.now();
  const { signed, headers } = signedHeaders(now);
  for (const socket of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(requestClientSource(req(headers, socket), SECRET, now), `forwarded:${signed.identity}`);
  }
});

test("SECURITY (b) the same valid headers from a non-loopback socket are IGNORED (the old trusted-proxy key)", () => withEnv({ CLIENT_SOURCE_TRUST_PROXY: "true" }, () => {
  const now = Date.now();
  const { headers } = signedHeaders(now);
  const spoofed = { ...headers, "x-forwarded-for": "127.0.0.1, 198.51.100.9", "x-real-ip": "127.0.0.1" };
  for (const socket of ["10.0.0.5", "100.64.0.9", "203.0.113.99", "::ffff:10.0.0.5"]) {
    assert.equal(verifiedInternalIdentity(spoofed, socket, SECRET, now), null);
    assert.equal(requestClientSource(req(spoofed, socket), SECRET, now), "198.51.100.9", `trusted-proxy key for ${socket}`);
  }
  withEnv({ CLIENT_SOURCE_TRUST_PROXY: undefined }, () => {
    assert.equal(requestClientSource(req(headers, "10.0.0.5"), SECRET, now), "10.0.0.5");
    assert.equal(requestClientSource(req(headers, undefined), SECRET, now), "unknown");
  });
  // A loopback address supplied only via headers never grants the signed path.
  assert.equal(verifiedInternalIdentity({ ...headers, "x-real-ip": "127.0.0.1" }, "10.0.0.5", SECRET, now), null);
}));

test("SECURITY (c) a timestamp older (or newer) than 90 seconds is ignored; 89s still passes", () => {
  const now = Date.now();
  const { signed, headers } = signedHeaders(now);
  assert.equal(verifiedInternalIdentity(headers, "127.0.0.1", SECRET, now + 89_000), `forwarded:${signed.identity}`);
  assert.equal(verifiedInternalIdentity(headers, "127.0.0.1", SECRET, now + 92_000), null);
  assert.equal(verifiedInternalIdentity(headers, "127.0.0.1", SECRET, now - 92_000), null);
});

test("SECURITY (d) a bad signature, or a tampered identity or timestamp, is ignored", () => {
  const now = Date.now();
  const { headers } = signedHeaders(now);
  const bad = (x: Record<string, string>) => verifiedInternalIdentity(x, "127.0.0.1", SECRET, now) === null;
  assert.ok(bad({ ...headers, "x-openfront-client-signature": "b".repeat(64) }));
  assert.ok(bad({ ...headers, "x-openfront-client-identity": "c".repeat(64) }));
  assert.ok(bad({ ...headers, "x-openfront-client-timestamp": String(Math.floor(now / 1000) + 1) }));
  assert.ok(bad({ ...headers, "x-openfront-client-signature": "nothex" }));
  assert.ok(bad({}));
  assert.ok(bad({ ...headers, "x-openfront-client-signature": signedHeaders(now, "203.0.113.7", "z".repeat(40)).signed.signature }));
});

test("SECURITY (e) a secret shorter than 32 characters is ignored and cannot sign", () => {
  const now = Date.now();
  const short = "s".repeat(31);
  assert.equal(signInternalClientIdentity("203.0.113.7", short, now), null);
  const { headers } = signedHeaders(now);
  assert.equal(verifiedInternalIdentity(headers, "127.0.0.1", short, now), null);
  const identity = createHash("sha256").update("203.0.113.7").digest("hex");
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac("sha256", short).update(`${timestamp}:${identity}`).digest("hex");
  const forged = { "x-openfront-client-identity": identity, "x-openfront-client-timestamp": timestamp, "x-openfront-client-signature": signature };
  assert.equal(verifiedInternalIdentity(forged, "127.0.0.1", short, now), null);
});

test("the retired unsigned/replayable x-gym-client-source header no longer moves the limiter key", () => withEnv({ CLIENT_SOURCE_TRUST_PROXY: undefined, SESSION_SECRET: SECRET }, () => {
  assert.equal(requestClientSource(req({ "x-gym-client-source": "203.0.113.7.anything" }, "10.0.0.5")), "10.0.0.5");
}));
