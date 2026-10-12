import { strict as assert } from "node:assert";
import test from "node:test";
import { overview } from "../src/lib/adminMetrics.js";

const NOW = new Date("2026-10-12T10:00:00Z");
const price = { monthly_price_paise: 199900, yearly_price_paise: 999900 };
const future = "2026-12-01T00:00:00Z";
const past = "2026-10-01T00:00:00Z";
const sub = (status: string, cycle: string | null, end = future) => ({
  clinic_id: Math.random().toString(),
  status,
  billing_cycle: cycle,
  current_period_end: end,
  trial_ends_at: null,
});

test("MRR: monthly at its price, yearly at a twelfth; trials and lapsed count nothing", () => {
  const o = overview(
    {
      clinics: [],
      subs: [sub("active", "monthly"), sub("active", "monthly"), sub("active", "yearly"), sub("trialing", null), sub("active", "monthly", past)],
      payments: [],
      price,
    },
    NOW,
  );
  assert.equal(o.paying, 3);
  assert.equal(o.payingMonthly, 2);
  assert.equal(o.payingYearly, 1);
  assert.equal(o.trialing, 1);
  assert.equal(o.lapsed, 1);
  assert.equal(o.mrrPaise, 2 * 199900 + Math.round(999900 / 12));
  assert.equal(o.arrPaise, o.mrrPaise * 12);
});

test("collected this month is cash received since the 1st, paid only", () => {
  const o = overview(
    {
      clinics: [{ created_at: "2026-10-05T00:00:00Z" }, { created_at: "2026-09-20T00:00:00Z" }],
      subs: [],
      payments: [
        { amount_paise: 999900, paid_at: "2026-10-03T00:00:00Z", status: "paid" },
        { amount_paise: 199900, paid_at: "2026-09-30T23:00:00Z", status: "paid" },
        { amount_paise: 199900, paid_at: null, status: "created" },
      ],
      price,
    },
    NOW,
  );
  assert.equal(o.collectedThisMonthPaise, 999900);
  assert.equal(o.paymentsThisMonth, 1);
  assert.equal(o.newClinicsThisMonth, 1);
});

test("trials ending within three days are counted for follow-up", () => {
  const o = overview(
    { clinics: [], subs: [sub("trialing", null, "2026-10-14T00:00:00Z"), sub("trialing", null, "2026-10-25T00:00:00Z")], payments: [], price },
    NOW,
  );
  assert.equal(o.trialsEndingIn3Days, 1);
});
