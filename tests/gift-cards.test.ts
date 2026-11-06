import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIFT_CARD_AMOUNTS, giftCodeFor, normalizeGiftCode, redeemGiftCardAtomic, validateGiftCardOrder } from "../features/keystone/mutations/giftCards";

const source = (path: string) => readFileSync(path, "utf8");

test("codes are 12 hex characters in groups of four, stable per payment, and typed codes normalize", () => {
  const code = giftCodeFor("pi_123");
  assert.match(code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(giftCodeFor("pi_123"), code);
  assert.equal(normalizeGiftCode(code.toLowerCase().replaceAll("-", " ")), code);
  assert.equal(normalizeGiftCode("123"), "");
});

test("orders take a listed amount, a name and valid emails; the buyer is the recipient when none is given", () => {
  assert.deepEqual(GIFT_CARD_AMOUNTS, [2500, 5000, 7500, 10000, 15000, 20000]);
  const own = validateGiftCardOrder({ amount: 5000, purchaserName: "Ana", purchaserEmail: "Ana@X.co" });
  assert.equal(own.recipientEmail, "ana@x.co");
  assert.equal(own.recipientName, "Ana");
  assert.throws(() => validateGiftCardOrder({ amount: 1234, purchaserName: "Ana", purchaserEmail: "a@x.co" }), /Choose one of the gift card amounts/);
  assert.throws(() => validateGiftCardOrder({ amount: 5000, purchaserName: "", purchaserEmail: "a@x.co" }), /Enter your name/);
  assert.throws(() => validateGiftCardOrder({ amount: 5000, purchaserName: "Ana", purchaserEmail: "a@x.co", recipientEmail: "nope" }), /valid email/);
});

function fakePrisma(card: any) {
  const tx: any = {
    $queryRaw: async () => [{ locked: true }],
    giftCard: {
      findFirst: async ({ where }: any) => (where.code === card.code && where.organizationId === card.organizationId ? { ...card } : null),
      update: async ({ data }: any) => Object.assign(card, data),
    },
  };
  return { $transaction: async (fn: any) => fn(tx), card };
}

test("redeeming debits the balance once per request key, records it in the ledger and refuses overspend or expiry", async () => {
  const code = giftCodeFor("pi_abc");
  const prisma: any = fakePrisma({ id: "g1", organizationId: "o1", code, status: "active", balance: 5000, initialValue: 5000, expiresAt: new Date("2027-11-06"), ledger: [] });
  const now = new Date("2026-11-06T12:00:00Z");
  const first = await redeemGiftCardAtomic(prisma, { organizationId: "o1", code, amount: 2500, requestKey: "req-00001", note: "Drop-in" }, now);
  assert.equal(first.balance, 2500);
  const replay = await redeemGiftCardAtomic(prisma, { organizationId: "o1", code, amount: 2500, requestKey: "req-00001", note: "Drop-in" }, now);
  assert.equal(replay.reused, true);
  assert.equal(prisma.card.balance, 2500);
  await assert.rejects(redeemGiftCardAtomic(prisma, { organizationId: "o1", code, amount: 3000, requestKey: "req-00002", note: "Shirt" }, now), /\$25 left/);
  const last = await redeemGiftCardAtomic(prisma, { organizationId: "o1", code, amount: 2500, requestKey: "req-00003", note: "Shirt" }, now);
  assert.equal(last.balance, 0);
  assert.equal(prisma.card.status, "redeemed");
  assert.equal(prisma.card.ledger.length, 2);
  await assert.rejects(redeemGiftCardAtomic(prisma, { organizationId: "o2", code, amount: 100, requestKey: "req-00004", note: "x" }, now), /No gift card/);
  const expired: any = fakePrisma({ id: "g2", organizationId: "o1", code, status: "active", balance: 5000, initialValue: 5000, expiresAt: new Date("2026-01-01"), ledger: [] });
  await assert.rejects(redeemGiftCardAtomic(expired, { organizationId: "o1", code, amount: 100, requestKey: "req-00005", note: "x" }, now), /expired/);
});

test("a card is issued only after Stripe reports the checkout paid, once, and the webhook routes gift card sessions", () => {
  const gift = source("features/keystone/mutations/giftCards.ts");
  assert.match(gift, /session\.status !== "complete" \|\| session\.payment_status !== "paid"/);
  assert.match(gift, /if \(current\.status === "completed"\) return \{ session: current, fresh: false \}/);
  assert.match(gift, /balance !== fresh\.initialValue\) throw new Error\("Only an unused gift card can be refunded"\)/);
  const webhook = source("features/keystone/mutations/paymentWebhook.ts");
  assert.match(webhook, /session\.metadata\?\.source === GIFT_CARD_SOURCE\) \{\s*await fulfillGiftCardCheckout/);
  assert.match(source("migrations/20261106160000_gym_gift_cards/migration.sql"), /CREATE TABLE "GiftCard"/);
});
