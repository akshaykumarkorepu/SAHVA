import { test } from "node:test";
import assert from "node:assert/strict";
import { policyRefund } from "../lib/refundPolicy";

const NOW = new Date("2026-10-12T10:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ahead = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const base = { amount_paise: 199900, captured_paise: 199900, refunded_paise: 0, billing_cycle: "monthly" };

test("within 7 days: everything not yet refunded", () => {
  assert.equal(policyRefund({ ...base, paid_at: ago(3), period_start: ago(3), period_end: ahead(27) }, NOW).paise, 199900);
  assert.equal(policyRefund({ ...base, refunded_paise: 50000, paid_at: ago(3), period_start: ago(3), period_end: ahead(27) }, NOW).paise, 149900);
});

test("monthly after 7 days: nothing", () => {
  assert.equal(policyRefund({ ...base, paid_at: ago(10), period_start: ago(10), period_end: ahead(20) }, NOW).paise, 0);
});

test("yearly after 7 days: unused whole months at a twelfth", () => {
  const y = { ...base, amount_paise: 999900, captured_paise: 999900, billing_cycle: "yearly" };
  // Paid 100 days ago for a year starting then: ~265 days left = 8 whole months.
  const r = policyRefund({ ...y, paid_at: ago(100), period_start: ago(100), period_end: ahead(265) }, NOW);
  assert.equal(r.paise, Math.round((999900 / 12) * 8));
  assert.match(r.why, /8 unused whole months/);
});

test("a yearly plan paid during the trial, not started yet, counts all twelve months", () => {
  const y = { ...base, amount_paise: 999900, captured_paise: 999900, billing_cycle: "yearly" };
  const r = policyRefund({ ...y, paid_at: ago(9), period_start: ahead(5), period_end: ahead(370) }, NOW);
  assert.equal(r.paise, 999900);
});

test("never more than is left", () => {
  assert.equal(policyRefund({ ...base, refunded_paise: 199900, paid_at: ago(1), period_start: ago(1), period_end: ahead(29) }, NOW).paise, 0);
});

test("wholeMonthsBetween counts the calendar", async () => {
  const { wholeMonthsBetween } = await import("../lib/refundPolicy");
  const d = (s: string) => new Date(s);
  assert.equal(wholeMonthsBetween(d("2026-10-17T00:00:00Z"), d("2027-10-17T00:00:00Z")), 12);
  assert.equal(wholeMonthsBetween(d("2026-10-17T00:00:00Z"), d("2027-10-16T00:00:00Z")), 11);
  assert.equal(wholeMonthsBetween(d("2026-01-31T00:00:00Z"), d("2026-03-01T00:00:00Z")), 1);
  assert.equal(wholeMonthsBetween(d("2026-10-17T00:00:00Z"), d("2026-10-01T00:00:00Z")), 0);
});
