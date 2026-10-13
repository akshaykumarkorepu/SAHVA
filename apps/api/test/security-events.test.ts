import test from "node:test";
import assert from "node:assert/strict";
import { Throttle, classify } from "../src/lib/securityEvents.js";

test("refused requests are recorded as the right kind", () => {
  assert.equal(classify("GET", "/api/patients", 401), "auth_failed");
  assert.equal(classify("GET", "/api/patients/123", 403), "access_denied");
  assert.equal(classify("GET", "/api/admin/overview", 401), "admin_denied");
  assert.equal(classify("GET", "/api/admin-eligibility", 401), "admin_denied");
  assert.equal(classify("GET", "/api/portal/abc/home", 401), "portal_link_invalid");
  assert.equal(classify("POST", "/api/voice/turn", 429), "rate_limited");
});

test("ordinary traffic and noise are not", () => {
  assert.equal(classify("GET", "/api/patients", 200), null);
  assert.equal(classify("GET", "/api/patients", 404), null);
  assert.equal(classify("OPTIONS", "/api/patients", 401), null);
  assert.equal(classify("GET", "/api/health", 401), null);
  assert.equal(classify("GET", "/wp-login.php", 401), null);
});

test("one row per address and kind per window", () => {
  const t = new Throttle(5_000, 3);
  assert.ok(t.allow("1.2.3.4|auth_failed", 0));
  assert.ok(!t.allow("1.2.3.4|auth_failed", 4_000));
  assert.ok(t.allow("1.2.3.4|access_denied", 4_000));
  assert.ok(t.allow("1.2.3.4|auth_failed", 6_000));
  // Bounded: a flood of addresses clears the map rather than growing it.
  for (let i = 0; i < 10; i++) t.allow(`10.0.0.${i}|auth_failed`, 7_000);
  assert.ok(t.allow("1.2.3.4|auth_failed", 7_500));
});
