import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createOrder, verifyPaymentSignature, verifyWebhookSignature } from "../src/lib/razorpay.js";

const SECRET = "test_secret_abc123";

test("a genuine Checkout signature verifies", () => {
  // Razorpay's documented scheme: HMAC-SHA256 of "order_id|payment_id".
  const sig = createHmac("sha256", SECRET).update("order_A|pay_B").digest("hex");
  assert.equal(verifyPaymentSignature("order_A", "pay_B", sig, SECRET), true);
});

test("a forged or mismatched signature does not", () => {
  const sig = createHmac("sha256", SECRET).update("order_A|pay_B").digest("hex");
  assert.equal(verifyPaymentSignature("order_A", "pay_OTHER", sig, SECRET), false, "different payment");
  assert.equal(verifyPaymentSignature("order_A", "pay_B", sig, "wrong_secret"), false, "wrong secret");
  assert.equal(verifyPaymentSignature("order_A", "pay_B", "deadbeef", SECRET), false, "short garbage");
  assert.equal(verifyPaymentSignature("order_A", "pay_B", "", SECRET), false, "empty");
});

test("webhook signatures are checked over the exact raw body", () => {
  const body = '{"event":"payment.captured"}';
  const sig = createHmac("sha256", "whsec").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(Buffer.from(body), sig, "whsec"), true);
  // Re-serialised JSON with different spacing is a different body.
  assert.equal(verifyWebhookSignature('{ "event": "payment.captured" }', sig, "whsec"), false);
});

test("createOrder sends paise in INR with basic auth, and surfaces provider errors", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id: "order_1", amount: 199900, currency: "INR", receipt: "r1" }), { status: 200 });
  }) as typeof fetch;
  const order = await createOrder({ keyId: "rzp_test_x", keySecret: "s" }, { amountPaise: 199900, receipt: "r1", notes: {} }, ok);
  assert.equal(order.id, "order_1");
  assert.equal(seen!.url, "https://api.razorpay.com/v1/orders");
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { amount: 199900, currency: "INR", receipt: "r1", notes: {} });
  assert.match(String((seen!.init.headers as Record<string, string>).Authorization), /^Basic /);

  const bad = (async () => new Response(JSON.stringify({ error: { description: "bad key" } }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(createOrder({ keyId: "rzp_test_x", keySecret: "s" }, { amountPaise: 1, receipt: "r", notes: {} }, bad), /Could not start the payment/);
});
