import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clinicStage } from "../lib/clinicStage";

const NOW = new Date("2026-10-12T10:00:00Z");
const ok = { verification_status: "approved" };
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

test("review comes first: nothing else matters until approved", () => {
  assert.equal(clinicStage({ verification_status: "submitted", subscription_status: null, current_period_end: null }, NOW), "pending");
  assert.equal(clinicStage({ verification_status: "suspended", subscription_status: "active", current_period_end: at(30) }, NOW), "suspended");
});

test("trial, paying, then three days of grace, then read-only", () => {
  assert.equal(clinicStage({ ...ok, subscription_status: "trialing", current_period_end: at(5) }, NOW), "trial");
  assert.equal(clinicStage({ ...ok, subscription_status: "active", current_period_end: at(5) }, NOW), "paying");
  assert.equal(clinicStage({ ...ok, subscription_status: "active", current_period_end: at(-2) }, NOW), "grace");
  assert.equal(clinicStage({ ...ok, subscription_status: "trialing", current_period_end: at(-4) }, NOW), "read_only");
});

test("an approved clinic with no subscription is legacy", () => {
  assert.equal(clinicStage({ ...ok, subscription_status: null, current_period_end: null }, NOW), "legacy");
});

test("the grace period matches the database's", () => {
  const sql = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261012001000_admin_clinics.sql"),
    "utf8",
  );
  assert.match(sql, /current_period_end \+ interval '3 days' > now\(\)/);
});
