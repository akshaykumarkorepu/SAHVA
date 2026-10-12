import test from "node:test";
import assert from "node:assert/strict";
import { render, type Outgoing } from "../src/lib/notify.js";

const links = { web: "https://app.sahva.in", admin: "https://admin.sahva.in" };
const clinic = (kind: string, payload: Record<string, unknown> = {}): Outgoing => ({
  kind,
  audience: "clinic",
  to_name: "Dr Anand",
  payload: { clinic_name: "Anand Clinic", ...payload },
});

test("every owner email greets by name, signs off, and links into the app", () => {
  for (const kind of [
    "application.received", "application.needs_info", "application.approved", "application.rejected",
    "clinic.suspended", "clinic.reinstated", "trial.ending", "subscription.ending", "subscription.lapsed",
    "payment.received", "payment.failed", "refund.processed",
  ]) {
    const e = render(clinic(kind, { note: "Upload the certificate", days: 3, ends_at: "2026-10-20T00:00:00Z" }), links);
    assert.ok(e.subject.length > 5 && e.subject.length < 90, `${kind} subject`);
    assert.match(e.text, /^Hello Dr Anand,/, kind);
    assert.match(e.text, /— SAHVA$/, kind);
    assert.doesNotMatch(e.subject, /undefined|null|NaN/, kind);
    assert.doesNotMatch(e.text, /undefined|NaN/, kind);
  }
});

test("money is shown in rupees, the Indian way", () => {
  const e = render(clinic("payment.received", { amount_paise: 999900, billing_cycle: "yearly", period_end: "2027-10-12T00:00:00Z", payment_ref: "pay_X" }), links);
  assert.equal(e.subject, "Payment received: ₹9,999");
  assert.match(e.text, /a year of SAHVA/);
  assert.match(e.text, /12 October 2027/);
  assert.match(e.text, /pay_X/);
});

test("a reminder says when, and how to pay", () => {
  const tomorrow = render(clinic("trial.ending", { days: 1, ends_at: "2026-10-13T06:00:00Z" }), links);
  assert.equal(tomorrow.subject, "Anand Clinic: your free trial ends tomorrow");
  assert.match(tomorrow.text, /https:\/\/app\.sahva\.in\/dashboard\/settings\/billing/);
  const lapsed = render(clinic("subscription.lapsed", { ended_at: "2026-10-10T00:00:00Z", stops_at: "2026-10-13T00:00:00Z", was_trial: true }), links);
  assert.match(lapsed.subject, /patient features stop on 13 October 2026/);
});

test("the reviewer's note is quoted to the owner", () => {
  const e = render(clinic("application.needs_info", { note: "Please upload the TSMC certificate" }), links);
  assert.match(e.text, /“Please upload the TSMC certificate”/);
});

test("admin emails link to the console, and disputes are marked urgent", () => {
  const e = render(
    { kind: "admin.payment_exception", audience: "admin", to_name: "Ops", payload: { clinic_name: "Anand Clinic", exception_kind: "dispute", amount_paise: 199900, payment_ref: "pay_1" } },
    links,
  );
  assert.equal(e.subject, "URGENT — Dispute / chargeback: Anand Clinic");
  assert.match(e.text, /https:\/\/admin\.sahva\.in\/admin\/payments/);
  const digest = render({ kind: "admin.daily_digest", audience: "admin", to_name: null, payload: { applications_waiting: 3, open_exceptions: 1 } }, links);
  assert.equal(digest.subject, "SAHVA daily: 3 applications, 1 payment problems");
  assert.match(digest.text, /^Hello,/);
});

test("html escapes what came from people", () => {
  const e = render(clinic("application.rejected", { note: `<script>alert(1)</script> & "x"` }), links);
  assert.doesNotMatch(e.html, /<script>/);
  assert.match(e.html, /&lt;script&gt;/);
});
