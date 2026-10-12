import { test } from "node:test";
import assert from "node:assert/strict";
import { canContact, currentStep, itemStage, messageState, progress } from "../lib/batch";

test("messageState: no message is never described as sent", () => {
  const s = messageState(null);
  assert.equal(s.label, "No message");
  assert.doesNotMatch(s.label + s.detail, /\b(sent|delivered|notified)\b(?! to)/i);
});

test("messageState: every step stops short of the next one", () => {
  // Each label must not claim the following state.
  assert.match(messageState({ status: "queued" }).detail, /not sent/i);
  assert.match(messageState({ status: "sending" }).detail, /not confirmed/i);
  assert.match(messageState({ status: "sent" }).detail, /not yet delivered/i);
  assert.match(messageState({ status: "delivered" }).detail, /not yet read/i);
});

test("messageState: failures are bad, and say why when we know", () => {
  const f = messageState({ status: "failed", error_code: "131026" });
  assert.equal(f.tone, "bad");
  assert.match(f.detail, /131026/);
  assert.equal(messageState({ status: "undelivered" }).tone, "bad");
});

test("itemStage: told is not rebooked", () => {
  assert.equal(itemStage("notified").label, "Told — not rebooked");
  assert.equal(itemStage("notified").tone, "warn");
  assert.equal(itemStage("rebooked").tone, "good");
});

test("canContact: only after approval, and only while the patient is open", () => {
  assert.equal(canContact("draft", "pending"), false);
  assert.equal(canContact("notifying", "pending"), true);
  assert.equal(canContact("notifying", "notified"), true);
  assert.equal(canContact("notifying", "rebooked"), false);
  assert.equal(canContact("notifying", "unreachable"), false);
  assert.equal(canContact("completed", "pending"), false);
});

test("progress: told-but-not-rebooked still counts as open", () => {
  assert.deepEqual(progress([{ status: "rebooked" }, { status: "notified" }, { status: "unreachable" }, { status: "pending" }]), {
    handled: 2,
    total: 4,
  });
});

test("currentStep: approval jumps straight to contacting patients", () => {
  assert.equal(currentStep("draft"), 0);
  assert.equal(currentStep("notifying"), 2);
  assert.equal(currentStep("completed"), 3);
});
