import { startSupabaseStub } from "./supabase-stub.js";

const stub = await startSupabaseStub();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPABASE_URL = stub.url;
process.env.SUPABASE_ANON_KEY = "test-anon-key-000000000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-00000000000000";
process.env.VOICE_API_KEY = "0123456789abcdef0123456789abcdef";

const test = (await import("node:test")).default;
const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
const express = (await import("express")).default;
const { requestContext } = await import("../src/middleware/context.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { requireAdminRole, requirePlatformAdmin, tokenAal } = await import("../src/middleware/admin.js");

/** A token shaped like Supabase's: header.payload.signature, with an aal claim. */
const jwt = (aal: string, tag: string) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ aal, tag })).toString("base64url")}.sig`;

const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const FINANCE = "aaaaaaaa-0000-0000-0000-000000000002";
const DISABLED = "aaaaaaaa-0000-0000-0000-000000000003";
const OWNER = "bbbbbbbb-0000-0000-0000-000000000001";

const tokens = {
  adminAal2: jwt("aal2", "a"),
  adminAal1: jwt("aal1", "a1"),
  financeAal2: jwt("aal2", "f"),
  disabledAal2: jwt("aal2", "d"),
  ownerAal2: jwt("aal2", "o"),
};
stub.state.users.set(tokens.adminAal2, { id: ADMIN, email: "ops@sahva.example" });
stub.state.users.set(tokens.adminAal1, { id: ADMIN, email: "ops@sahva.example" });
stub.state.users.set(tokens.financeAal2, { id: FINANCE, email: "fin@sahva.example" });
stub.state.users.set(tokens.disabledAal2, { id: DISABLED, email: "old@sahva.example" });
stub.state.users.set(tokens.ownerAal2, { id: OWNER, email: "ravi@srisai.in" });
stub.state.platformAdmins.set(ADMIN, { role: "super_admin", full_name: "Ops", disabled_at: null });
stub.state.platformAdmins.set(FINANCE, { role: "finance", full_name: "Fin", disabled_at: null });
stub.state.platformAdmins.set(DISABLED, { role: "super_admin", full_name: "Old", disabled_at: "2026-10-01T00:00:00Z" });

async function serve() {
  const app = express();
  app.use(requestContext);
  app.get("/admin/me", requirePlatformAdmin, (req, res) => res.json(req.admin));
  app.get("/admin/reviewers", requirePlatformAdmin, requireAdminRole("reviewer"), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const get = (url: string, token?: string) =>
  fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test("tokenAal reads the claim, and garbage reads as nothing", () => {
  assert.equal(tokenAal(jwt("aal2", "x")), "aal2");
  assert.equal(tokenAal("not-a-jwt"), null);
  assert.equal(tokenAal("a.%%%.c"), null);
});

test("an admin who passed their second factor gets in", async () => {
  const srv = await serve();
  try {
    const r = await get(`${srv.url}/admin/me`, tokens.adminAal2);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { role: string }).role, "super_admin");
  } finally {
    await srv.close();
  }
});

test("the same admin without the second factor is sent back for it", async () => {
  const srv = await serve();
  try {
    const r = await get(`${srv.url}/admin/me`, tokens.adminAal1);
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, "MFA_REQUIRED");
  } finally {
    await srv.close();
  }
});

test("no token, a clinic owner, or a disabled admin are all refused", async () => {
  const srv = await serve();
  try {
    assert.equal((await get(`${srv.url}/admin/me`)).status, 401);
    assert.equal((await get(`${srv.url}/admin/me`, tokens.ownerAal2)).status, 403);
    assert.equal((await get(`${srv.url}/admin/me`, tokens.disabledAal2)).status, 403);
  } finally {
    await srv.close();
  }
});

test("admin roles narrow access, and a super admin passes every role gate", async () => {
  const srv = await serve();
  try {
    assert.equal((await get(`${srv.url}/admin/reviewers`, tokens.financeAal2)).status, 403);
    assert.equal((await get(`${srv.url}/admin/reviewers`, tokens.adminAal2)).status, 200);
  } finally {
    await srv.close();
  }
});

test.after(async () => {
  await stub.close();
});
