import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICE, daysLeft, inr, perMonthOnYearly, subscriptionState, yearlySaving } from "../lib/pricing";

test("the page shows ₹1,999 a month, ₹9,999 a year, 14-day trial", () => {
  assert.equal(inr(PRICE.monthlyPaise), "₹1,999");
  assert.equal(inr(PRICE.yearlyPaise), "₹9,999");
  assert.equal(PRICE.trialDays, 14);
});

test("the page's prices match what the database charges", () => {
  // The API charges from the plans table, so a mismatch would show one price
  // and take another. Read the migration that sets them.
  const sql = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261012000700_clinic_signup_and_billing.sql"),
    "utf8",
  );
  assert.match(sql, new RegExp(`'starter', 'SAHVA for Clinics', ${PRICE.monthlyPaise}, ${PRICE.yearlyPaise}`));
  assert.match(sql, new RegExp(`interval '${PRICE.trialDays} days'`));
});

test("yearly saves ₹13,989 — 58% — against twelve monthly payments", () => {
  assert.deepEqual(yearlySaving(), { paise: 1398900, percent: 58 });
  assert.equal(inr(perMonthOnYearly()), "₹833");
});

test("days left counts a partial day, and never goes negative", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  assert.equal(daysLeft("2026-10-26T10:00:00Z", now), 14);
  assert.equal(daysLeft("2026-10-12T11:00:00Z", now), 1);
  assert.equal(daysLeft("2026-10-11T10:00:00Z", now), 0);
  assert.equal(daysLeft(null, now), 0);
});

test("subscription states", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const future = "2026-11-01T00:00:00Z";
  const past = "2026-10-01T00:00:00Z";
  assert.equal(subscriptionState({ status: "trialing", trial_ends_at: future, current_period_end: future }, now), "trial");
  assert.equal(subscriptionState({ status: "trialing", trial_ends_at: past, current_period_end: past }, now), "trial_ended");
  assert.equal(subscriptionState({ status: "active", trial_ends_at: null, current_period_end: future }, now), "active");
  assert.equal(subscriptionState({ status: "active", trial_ends_at: null, current_period_end: past }, now), "lapsed");
  assert.equal(subscriptionState(null, now), "none");
});
