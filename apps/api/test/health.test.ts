import { strict as assert } from "node:assert";
import test from "node:test";
import { health, type Signals } from "../src/lib/health.js";

const NOW = new Date("2026-10-12T10:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const good: Signals = {
  verification_status: "approved",
  subscription_status: "active",
  current_period_end: days(200),
  ever_paid: true,
  bookings_14d: 60,
  bookings_prev_14d: 55,
  open_actions: 2,
  oldest_action_at: days(-1),
  last_staff_sign_in: days(-1),
  created_at: days(-120),
};

test("a busy paying clinic is healthy with nothing to say", () => {
  assert.deepEqual(health(good, NOW), { score: 100, band: "healthy", reasons: [] });
});

test("clinics in review are not scored", () => {
  assert.equal(health({ ...good, verification_status: "submitted" }, NOW), null);
});

test("an unpaid trial ending soon, quiet staff: watch, with reasons", () => {
  const h = health({ ...good, subscription_status: "trialing", ever_paid: false, current_period_end: days(2), last_staff_sign_in: days(-8) }, NOW)!;
  assert.equal(h.score, 65);
  assert.equal(h.band, "watch");
  assert.deepEqual(h.reasons, ["Trial ends in 2 days, not paid yet", "No staff sign-in for 8 days"]);
});

test("lapsed past grace with no bookings is at risk", () => {
  const h = health({ ...good, current_period_end: days(-5), bookings_14d: 0, bookings_prev_14d: 0 }, NOW)!;
  assert.equal(h.band, "at_risk");
  assert.ok(h.reasons.includes("Not live: trial or plan ended more than 3 days ago"));
  assert.ok(h.reasons.includes("No bookings in two weeks"));
});

test("a halving of bookings is noticed; a small clinic's quiet week is not", () => {
  assert.deepEqual(health({ ...good, bookings_14d: 10, bookings_prev_14d: 40 }, NOW)!.reasons, ["Bookings down 75% on the fortnight before"]);
  assert.deepEqual(health({ ...good, bookings_14d: 1, bookings_prev_14d: 3 }, NOW)!.reasons, []);
});

test("a new clinic is not marked down for having no bookings yet", () => {
  assert.deepEqual(health({ ...good, created_at: days(-5), bookings_14d: 0, bookings_prev_14d: 0, last_staff_sign_in: days(-1) }, NOW)!.reasons, []);
});

test("an old backlog of action items counts", () => {
  assert.deepEqual(health({ ...good, open_actions: 3, oldest_action_at: days(-5) }, NOW)!.reasons, ["3 Action Required items waiting, oldest 5 days"]);
});

test("the score never goes below zero", () => {
  const h = health({ ...good, verification_status: "suspended", current_period_end: days(-10), bookings_14d: 0, last_staff_sign_in: null, open_actions: 50, oldest_action_at: days(-30) }, NOW)!;
  assert.equal(h.score, 0);
});
