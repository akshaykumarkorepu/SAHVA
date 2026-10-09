import { startSupabaseStub } from "./supabase-stub.js";

const stub = await startSupabaseStub();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPABASE_URL = stub.url;
process.env.SUPABASE_ANON_KEY = "test-anon-key-000000000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-00000000000000";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-000000";
process.env.VOICE_API_KEY = "0123456789abcdef0123456789abcdef";

const test = (await import("node:test")).default;
const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
const express = (await import("express")).default;
const { requirePortalToken } = await import("../src/middleware/portalAuth.js");
const { requestContext } = await import("../src/middleware/context.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { generatePortalToken } = await import("../src/lib/portalToken.js");

const PATIENT = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa";
const CLINIC = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb";

const valid = generatePortalToken();
stub.state.portalTokens.set(valid.hash, {
  patient_id: PATIENT,
  clinic_id: CLINIC,
  token_id: "cccccccc-3333-3333-3333-cccccccccccc",
});

// Generated but never registered — stands in for expired and revoked, which the
// database also resolves to "no row".
const stale = generatePortalToken();

async function serve() {
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  app.get("/api/portal/:token", requirePortalToken, (req, res) =>
    res.json({ patientId: req.portal!.patientId, clinicId: req.portal!.clinicId }),
  );
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("a valid link resolves to its own patient and clinic", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.url}/api/portal/${valid.raw}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { patientId: string; clinicId: string };
    assert.equal(body.patientId, PATIENT);
    assert.equal(body.clinicId, CLINIC);
  } finally {
    await s.close();
  }
});

test("malformed links are refused without touching the database", async () => {
  const s = await serve();
  const before = stub.state.requests.length;
  try {
    for (const bad of ["short", "a".repeat(200), "not-a-real-token-at-all!!"]) {
      const res = await fetch(`${s.url}/api/portal/${encodeURIComponent(bad)}`);
      assert.equal(res.status, 401, `${bad} should be 401`);
    }
    // No lookup should have been attempted for any of them.
    assert.equal(stub.state.requests.length, before, "no database round trip for junk input");
  } finally {
    await s.close();
  }
});

test("unknown, expired and revoked links are indistinguishable", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.url}/api/portal/${stale.raw}`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "UNAUTHENTICATED");
    // The message must not reveal whether the link ever existed.
    assert.doesNotMatch(body.error.message, /revoked|unknown|not found/i);
    assert.match(body.error.message, /expired/i);
  } finally {
    await s.close();
  }
});

test("a near-miss of a real token does not resolve", async () => {
  const s = await serve();
  try {
    const tampered = valid.raw.slice(0, -1) + (valid.raw.endsWith("A") ? "B" : "A");
    const res = await fetch(`${s.url}/api/portal/${tampered}`);
    assert.equal(res.status, 401);
  } finally {
    await s.close();
  }
});

test("the raw token never appears in the response", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.url}/api/portal/${valid.raw}`);
    const text = await res.text();
    assert.ok(!text.includes(valid.raw), "the link must not be echoed back");
    assert.ok(!text.includes(valid.hash), "the hash must not be exposed either");
  } finally {
    await s.close();
  }
});

test.after(async () => {
  await stub.close();
});
