import { startSupabaseStub } from "./supabase-stub.js";

const stub = await startSupabaseStub();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPABASE_URL = stub.url;
process.env.SUPABASE_ANON_KEY = "test-anon-key-000000000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-00000000000000";
process.env.VOICE_API_KEY = "0123456789abcdef0123456789abcdef";
process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
process.env.RAZORPAY_KEY_SECRET = "test_key_secret_123";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_123";

const test = (await import("node:test")).default;
const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
const { createHmac } = await import("node:crypto");
const express = (await import("express")).default;
const { requestContext } = await import("../src/middleware/context.js");
const { razorpayWebhook } = await import("../src/routes/razorpayWebhook.js");

async function serve() {
  const app = express();
  app.use(requestContext);
  app.post("/hook", express.raw({ type: "*/*" }), razorpayWebhook);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/hook`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const sign = (body: string) => createHmac("sha256", "whsec_test_123").update(body).digest("hex");

test("unsigned and wrongly signed webhooks are refused", async () => {
  const srv = await serve();
  try {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } });
    const none = await fetch(srv.url, { method: "POST", body, headers: { "content-type": "application/json" } });
    assert.equal(none.status, 400);
    const forged = await fetch(srv.url, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-razorpay-signature": sign(body + " ") },
    });
    assert.equal(forged.status, 400);
  } finally {
    await srv.close();
  }
});

test("a correctly signed event we do not handle is acknowledged, not acted on", async () => {
  const srv = await serve();
  try {
    const body = JSON.stringify({ event: "order.paid", payload: {} });
    const r = await fetch(srv.url, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-razorpay-signature": sign(body) },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, ignored: true });
  } finally {
    await srv.close();
  }
});

test.after(async () => {
  await stub.close();
});
