import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestContext } from "../src/middleware/context.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { authLimiter, portalLimiter } from "../src/middleware/rateLimit.js";

async function serve(build: (app: express.Express) => void) {
  const app = express();
  // `true` trusts every hop, which lets a client spoof X-Forwarded-For and
  // defeat the limiter. Production trusts exactly one proxy; match that here.
  app.set("trust proxy", 1);
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

test("credential endpoints stop brute force after a handful of attempts", async () => {
  const s = await serve((app) =>
    app.post("/claim", authLimiter(), (_req, res) => res.json({ ok: true })),
  );
  try {
    const attempt = () =>
      fetch(`${s.url}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ email: "victim@example.in", password: "guess" }),
      });

    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await attempt()).status);

    assert.ok(codes.includes(429), "must eventually return 429");
    // 8 per 15 minutes: guessing a password at this rate is pointless.
    assert.equal(codes.filter((c) => c === 200).length, 8);

    const blocked = await attempt();
    const body = (await blocked.json()) as { error: { code: string } };
    assert.equal(blocked.status, 429);
    assert.equal(body.error.code, "TOO_MANY_REQUESTS");
  } finally {
    await s.close();
  }
});

test("the limit is per account, so one victim's lockout does not shield others", async () => {
  const s = await serve((app) =>
    app.post("/claim", authLimiter(), (_req, res) => res.json({ ok: true })),
  );
  try {
    const hit = (email: string) =>
      fetch(`${s.url}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({ email, password: "x" }),
      });

    for (let i = 0; i < 9; i++) await hit("a@example.in");
    const aBlocked = await hit("a@example.in");
    assert.equal(aBlocked.status, 429, "the attacked account is locked");

    // Same IP, different account: still limited, but on its own budget — one
    // user hitting a limit must not become a denial of service for everyone
    // else behind the same carrier NAT.
    const bFirst = await hit("b@example.in");
    assert.equal(bFirst.status, 200, "a different account has its own budget");
  } finally {
    await s.close();
  }
});

test("portal links are rate limited so a token cannot be brute forced", async () => {
  const s = await serve((app) =>
    app.get("/p/:token", portalLimiter(), (_req, res) => res.json({ ok: true })),
  );
  try {
    const codes: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`${s.url}/p/token${i}`, {
        headers: { "x-forwarded-for": "203.0.113.11" },
      });
      codes.push(r.status);
    }
    assert.ok(codes.includes(429), "guessing tokens must be throttled");
    assert.equal(codes.filter((c) => c === 200).length, 30);
  } finally {
    await s.close();
  }
});

test("a rate-limited response still carries the standard error envelope", async () => {
  const s = await serve((app) =>
    app.post("/claim", authLimiter(), (_req, res) => res.json({ ok: true })),
  );
  try {
    for (let i = 0; i < 9; i++) {
      await fetch(`${s.url}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.12" },
        body: JSON.stringify({ email: "c@example.in" }),
      });
    }
    const res = await fetch(`${s.url}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.12" },
      body: JSON.stringify({ email: "c@example.in" }),
    });
    const body = (await res.json()) as { error: { code: string; message: string }; requestId: string };
    assert.equal(res.status, 429);
    assert.equal(body.error.code, "TOO_MANY_REQUESTS");
    assert.ok(body.requestId, "still traceable to a log line");
    // RateLimit headers let a well-behaved client back off on its own.
    assert.ok(res.headers.get("ratelimit") || res.headers.get("ratelimit-limit"));
  } finally {
    await s.close();
  }
});
