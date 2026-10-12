import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * A portal link is a bearer credential sent over WhatsApp. It can be
 * forwarded, so what it opens must stay limited to scheduling: seeing,
 * confirming and moving an appointment. Diagnoses, prescriptions and bills
 * sit behind the password-protected patient account, never behind a link.
 *
 * Nothing enforced that except nobody having written such a query. This does.
 */
const ALLOWED = new Set([
  "appointment_events",
  "appointments",
  "clinic_closures",
  "clinic_hours",
  "clinic_settings",
  "clinics",
  "doctor_sessions",
  "doctors",
  "patients",
  "v_patient_appointments",
]);

test("portal routes touch only scheduling tables", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "src", "routes", "portal.ts"), "utf8");
  const tables = [...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
  const rpcs = [...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(tables.length > 0, "found no queries — has the file moved?");
  assert.deepEqual(tables.filter((t) => !ALLOWED.has(t)), []);
  // Scheduling RPCs only; anything new must be added here deliberately.
  assert.deepEqual(
    rpcs.filter((r) => !["get_available_slots", "reschedule_appointment", "cancel_appointment"].includes(r)),
    [],
  );
});
