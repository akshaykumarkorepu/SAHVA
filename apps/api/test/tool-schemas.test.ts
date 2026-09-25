import test from "node:test";
import assert from "node:assert/strict";
import { TOOL_ARG_SCHEMAS, TOOL_NAMES } from "../src/tools/schemas.js";

test("exactly the four sanctioned tools exist", () => {
  assert.deepEqual([...TOOL_NAMES].sort(), [
    "book_appointment",
    "cancel_appointment",
    "check_availability",
    "reschedule_appointment",
  ]);
});

test("booking requires a phone number in E.164", () => {
  const base = {
    patient_name: "Lakshmi Devi",
    doctor: "Dr Anitha",
    starts_at: "2026-09-28T10:00:00+05:30",
  };
  // A 10-digit local number is what a caller says; the model must normalise it
  // before the database ever sees it.
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, phone: "9885512345" }).success, false);
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, phone: "+919885512345" }).success, true);
});

test("booking rejects a timestamp without an offset", () => {
  const base = { patient_name: "X", phone: "+919885512345", doctor: "Dr Anitha" };
  // Naive local time is how you book someone into the wrong hour.
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, starts_at: "2026-09-28T10:00:00" }).success, false);
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, starts_at: "2026-09-28 10:00" }).success, false);
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, starts_at: "2026-09-28T10:00:00+05:30" }).success, true);
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, starts_at: "2026-09-28T04:30:00Z" }).success, true);
});

test("availability requires a plain YYYY-MM-DD date", () => {
  assert.equal(TOOL_ARG_SCHEMAS.check_availability.safeParse({ doctor: "Dr Anitha", date: "28-09-2026" }).success, false);
  assert.equal(TOOL_ARG_SCHEMAS.check_availability.safeParse({ doctor: "Dr Anitha", date: "2026-09-28" }).success, true);
});

test("cancel needs only a phone, with an optional name to disambiguate", () => {
  // One handset serves a family, so the name is how you tell them apart.
  assert.equal(TOOL_ARG_SCHEMAS.cancel_appointment.safeParse({ phone: "+919885512345" }).success, true);
  assert.equal(
    TOOL_ARG_SCHEMAS.cancel_appointment.safeParse({ phone: "+919885512345", patient_name: "Aarav" }).success,
    true,
  );
  assert.equal(TOOL_ARG_SCHEMAS.cancel_appointment.safeParse({}).success, false);
});

test("a patient name cannot be blank or absurdly long", () => {
  const base = { phone: "+919885512345", doctor: "Dr Anitha", starts_at: "2026-09-28T10:00:00+05:30" };
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, patient_name: "" }).success, false);
  assert.equal(TOOL_ARG_SCHEMAS.book_appointment.safeParse({ ...base, patient_name: "x".repeat(101) }).success, false);
});
