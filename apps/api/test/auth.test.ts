import { startSupabaseStub } from "./supabase-stub.js";

// The stub must exist before config/env is read, because SUPABASE_URL has to
// point at it. Everything below is therefore a dynamic import.
const stub = await startSupabaseStub();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPABASE_URL = stub.url;
process.env.SUPABASE_ANON_KEY = "test-anon-key-000000000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-00000000000000";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-000000";
process.env.VOICE_API_KEY = "0123456789abcdef0123456789abcdef";

const test = (await import("node:test")).default;
// TypeScript requires an explicit annotation before it will treat `assert.ok`
// as an assertion function through a dynamic import.
const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
const express = (await import("express")).default;
const { requireAuth, requireRole, requireServiceKey } = await import("../src/middleware/auth.js");
const { requestContext } = await import("../src/middleware/context.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");

const OWNER = "11111111-1111-1111-1111-111111111111";
const RECEPTIONIST = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const CLINIC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

stub.state.users.set("owner-token", { id: OWNER, email: "ravi@srisai.in" });
stub.state.users.set("recep-token", { id: RECEPTIONIST, email: "geeta@srisai.in" });
stub.state.users.set("stranger-token", { id: STRANGER, email: "nobody@example.com" });
stub.state.members.set(OWNER, { clinic_id: CLINIC, role: "owner" });
stub.state.members.set(RECEPTIONIST, { clinic_id: CLINIC, role: "receptionist" });
// STRANGER deliberately has no membership row.

/** A server wired from the real middleware, listening on an ephemeral port. */
async function serve(build: (app: ReturnType<typeof express>) => void) {
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  build(app);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("requireServiceKey rejects a missing, wrong, or truncated key", async () => {
  const s = await serve((app) =>
    app.get("/x", requireServiceKey("voice"), (_req, res) => res.json({ ok: true })),
  );
  try {
    for (const headers of [
      undefined,
      { "x-sahva-key": "" },
      { "x-sahva-key": "wrong" },
      // A prefix of the real key must not pass; the compare is length-checked
      // before timingSafeEqual, which throws on mismatched lengths.
      { "x-sahva-key": "0123456789abcdef" },
      { "x-sahva-key": `${process.env.VOICE_API_KEY}extra` },
    ]) {
      const res = await fetch(`${s.url}/x`, { headers: headers as Record<string, string> });
      assert.equal(res.status, 401, `expected 401 for ${JSON.stringify(headers)}`);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "UNAUTHENTICATED");
    }

    const ok = await fetch(`${s.url}/x`, {
      headers: { "x-sahva-key": process.env.VOICE_API_KEY! },
    });
    assert.equal(ok.status, 200);
  } finally {
    await s.close();
  }
});

test("requireAuth rejects a missing or malformed bearer token", async () => {
  const s = await serve((app) =>
    app.get("/x", requireAuth, (_req, res) => res.json({ ok: true })),
  );
  try {
    for (const headers of [undefined, { authorization: "Token abc" }, { authorization: "Bearer " }]) {
      const res = await fetch(`${s.url}/x`, { headers: headers as Record<string, string> });
      assert.equal(res.status, 401);
    }
  } finally {
    await s.close();
  }
});

test("requireAuth rejects a token the auth server does not recognise", async () => {
  const s = await serve((app) =>
    app.get("/x", requireAuth, (_req, res) => res.json({ ok: true })),
  );
  try {
    const res = await fetch(`${s.url}/x`, { headers: { authorization: "Bearer nope" } });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { message: string } };
    assert.match(body.error.message, /invalid or expired/i);
  } finally {
    await s.close();
  }
});

test("the clinic comes from clinic_members, never from the request", async () => {
  const s = await serve((app) =>
    app.post("/x", requireAuth, (req, res) =>
      res.json({ clinicId: req.auth!.clinicId, role: req.auth!.role, userId: req.auth!.userId }),
    ),
  );
  try {
    const res = await fetch(`${s.url}/x`, {
      method: "POST",
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      // A client trying to pick its own tenant. It must be ignored entirely.
      body: JSON.stringify({ clinic_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { clinicId: string; role: string; userId: string };
    assert.equal(body.clinicId, CLINIC, "clinic must come from membership");
    assert.equal(body.role, "owner");
    assert.equal(body.userId, OWNER);
  } finally {
    await s.close();
  }
});

test("an authenticated user with no membership is refused, not given a blank clinic", async () => {
  const s = await serve((app) =>
    app.get("/x", requireAuth, (_req, res) => res.json({ ok: true })),
  );
  try {
    const res = await fetch(`${s.url}/x`, { headers: { authorization: "Bearer stranger-token" } });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /not an active member/i);
  } finally {
    await s.close();
  }
});

test("requireRole keeps a receptionist out of configuration routes", async () => {
  const s = await serve((app) =>
    app.get("/settings", requireAuth, requireRole("owner", "manager"), (_req, res) =>
      res.json({ ok: true }),
    ),
  );
  try {
    const denied = await fetch(`${s.url}/settings`, {
      headers: { authorization: "Bearer recep-token" },
    });
    assert.equal(denied.status, 403);
    const body = (await denied.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /owner or manager/);

    const allowed = await fetch(`${s.url}/settings`, {
      headers: { authorization: "Bearer owner-token" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await s.close();
  }
});

test("every response carries a request id, echoed in the header", async () => {
  const s = await serve((app) => app.get("/x", (_req, res) => res.json({ ok: true })));
  try {
    const res = await fetch(`${s.url}/x`);
    const header = res.headers.get("x-request-id");
    assert.ok(header && header.length > 8, "x-request-id must be set");

    // A caller-supplied id is honoured so a trace survives across services.
    const traced = await fetch(`${s.url}/x`, { headers: { "x-request-id": "trace-abc-123" } });
    assert.equal(traced.headers.get("x-request-id"), "trace-abc-123");

    // ...but a junk value is replaced rather than reflected back.
    const junk = await fetch(`${s.url}/x`, { headers: { "x-request-id": "bad id with spaces!" } });
    assert.notEqual(junk.headers.get("x-request-id"), "bad id with spaces!");
  } finally {
    await s.close();
  }
});

test.after(async () => {
  await stub.close();
});
