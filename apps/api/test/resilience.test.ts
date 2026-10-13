import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { keyMatches, serviceKeys } from "../src/middleware/auth.js";
import { evaluate } from "../src/lib/systemHealth.js";

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);

test("each machine caller can have its own key; without one it uses the voice key", () => {
  const e = { VOICE_API_KEY: A, TELEPHONY_API_KEY: B, WORKER_API_KEY: undefined };
  assert.ok(keyMatches(A, serviceKeys("voice", e)));
  assert.ok(keyMatches(B, serviceKeys("telephony", e)));
  assert.ok(!keyMatches(A, serviceKeys("telephony", e)), "the voice key does not open telephony");
  assert.ok(keyMatches(A, serviceKeys("worker", e)), "worker falls back to the voice key");
});

test("a key can be rotated: old and new both work while callers switch", () => {
  const keys = serviceKeys("worker", { VOICE_API_KEY: A, TELEPHONY_API_KEY: undefined, WORKER_API_KEY: `${B}, ${C}` });
  assert.ok(keyMatches(B, keys));
  assert.ok(keyMatches(C, keys));
  assert.ok(!keyMatches(A, keys));
  assert.ok(!keyMatches("", keys));
});

test("keys shorter than 32 characters are ignored", () => {
  assert.equal(serviceKeys("worker", { VOICE_API_KEY: A, TELEPHONY_API_KEY: undefined, WORKER_API_KEY: "short" }).length, 0);
});

const fresh = (job: string, min = 5) => ({ job, minutes_since_ok: min, last_error: null });

test("healthy when the database answers and every configured job ran recently", () => {
  const h = evaluate([fresh("database_jobs"), fresh("email_sender"), fresh("payment_reconcile", 600)], { email: true, payments: true }, true);
  assert.equal(h.ok, true);
});

test("a stopped job makes the whole check fail, with the reason", () => {
  const h = evaluate([fresh("database_jobs", 90), fresh("email_sender")], { email: true, payments: false }, true);
  assert.equal(h.ok, false);
  assert.match(h.checks.find((c) => c.name === "database_jobs")!.detail, /limit 30/);
});

test("a job that never succeeded is down; an unconfigured one is not counted", () => {
  const h = evaluate([fresh("database_jobs")], { email: true, payments: false }, true);
  assert.equal(h.ok, false);
  assert.equal(h.checks.find((c) => c.name === "email_sender")!.detail, "never succeeded");
  assert.equal(h.checks.some((c) => c.name === "payment_reconcile"), false);
});

test("an unreachable database fails the check", () => {
  assert.equal(evaluate([], { email: false, payments: false }, false).ok, false);
});
