import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("Stripe webhooks use the Openfront payment-webhook path", () => {
  assert.equal(existsSync("app/api/stripe/webhook/route.ts"), false);
  const route = readFileSync("app/api/payment-webhooks/[providerId]/route.ts", "utf8");
  assert.match(route, /SUPPORTED_PROVIDERS = new Set\(\["pp_stripe"\]\)/);
  assert.match(route, /handleStripeWebhook\(/);
  assert.match(route, /status: 404/);
  assert.match(readFileSync("README.md", "utf8"), /\/api\/payment-webhooks\/pp_stripe/);
});

test("the previously registered Stripe endpoint URL still reaches the handler", () => {
  assert.match(readFileSync("next.config.ts", "utf8"), /source: '\/api\/stripe\/webhook', destination: '\/api\/payment-webhooks\/pp_stripe'/);
});
