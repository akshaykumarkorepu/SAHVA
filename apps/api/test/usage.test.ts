import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { UNIT_COST_MICRO_INR, buildUsageRows } from "../src/lib/usage.js";

test("unit costs are integers in micro-INR", () => {
  // Floats drift across millions of rows, and paise rounds LLM tokens to zero.
  for (const [kind, cost] of Object.entries(UNIT_COST_MICRO_INR)) {
    assert.ok(Number.isInteger(cost), `${kind} must be an integer`);
    assert.ok(cost > 0, `${kind} must be positive`);
  }
});

test("quoted vendor rates convert correctly", () => {
  // ~Rs 40/hour of audio
  assert.equal((UNIT_COST_MICRO_INR.stt_seconds * 3600) / 1_000_000, 39.9996);
  // ~Rs 22 per 10,000 characters
  assert.equal((UNIT_COST_MICRO_INR.tts_characters * 10_000) / 1_000_000, 22);
  // ~Rs 0.50 per minute
  assert.equal((UNIT_COST_MICRO_INR.telephony_seconds * 60) / 1_000_000, 0.49998);
});

test("a realistic 108-second call costs about Rs 3.59", () => {
  // The figure the pricing conversation rests on. If this moves, the deck is
  // wrong and someone should notice here first.
  const rows = buildUsageRows("c1", "call1", [
    { kind: "stt_seconds", provider: "sarvam", quantity: 108 },
    { kind: "tts_characters", provider: "sarvam", quantity: 640 },
    { kind: "llm_input_tokens", provider: "anthropic", quantity: 4200 },
    { kind: "llm_output_tokens", provider: "anthropic", quantity: 380 },
    { kind: "telephony_seconds", provider: "exotel", quantity: 108 },
  ]);
  const totalInr =
    rows.reduce((t, r) => t + Number(r.quantity) * r.unit_cost_micro_inr, 0) / 1_000_000;
  assert.ok(Math.abs(totalInr - 3.59) < 0.01, `expected ~3.59, got ${totalInr}`);
  // 100 calls a month is well under a Rs 999 subscription.
  assert.ok(totalInr * 100 < 999);
});

test("zero-quantity entries produce no row", () => {
  // "No row" and "a row that cost nothing" mean different things when
  // reconciling against a vendor invoice.
  const rows = buildUsageRows("c1", "call1", [
    { kind: "stt_seconds", provider: "sarvam", quantity: 0 },
    { kind: "tts_characters", provider: "sarvam", quantity: 12 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "tts_characters");
});

test("rows carry the clinic and call so cost is attributable", () => {
  const [row] = buildUsageRows("clinic-1", "call-9", [
    { kind: "sms_message", provider: "exotel", quantity: 1 },
  ]);
  assert.equal(row.clinic_id, "clinic-1");
  assert.equal(row.call_id, "call-9");
  assert.equal(row.unit_cost_micro_inr, UNIT_COST_MICRO_INR.sms_message);
});

test("a call-less entry is still attributed to a clinic", () => {
  const [row] = buildUsageRows("clinic-1", null, [
    { kind: "whatsapp_message", provider: "meta", quantity: 1 },
  ]);
  assert.equal(row.call_id, null);
  assert.equal(row.clinic_id, "clinic-1");
});
