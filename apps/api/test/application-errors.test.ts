import { strict as assert } from "node:assert";
import test from "node:test";
import type { PostgrestError } from "@supabase/supabase-js";
import { applicationError } from "../src/lib/applicationErrors.js";

const pg = (code: string, message: string): PostgrestError =>
  ({ code, message, details: "", hint: "", name: "PostgrestError" }) as PostgrestError;

test("each duplicate says which identifier is already registered", () => {
  assert.equal(applicationError(pg("23505", 'duplicate key value violates unique constraint "clinics_hfr_id_key"')).code, "HFR_TAKEN");
  assert.equal(applicationError(pg("23505", 'violates unique constraint "clinics_establishment_reg_unique"')).code, "REGISTRATION_TAKEN");
  assert.equal(applicationError(pg("23505", 'violates unique constraint "clinics_gstin_key"')).code, "GSTIN_TAKEN");
  assert.equal(applicationError(pg("23505", 'violates unique constraint "clinics_phone_e164_key"')).code, "PHONE_TAKEN");
  assert.equal(applicationError(pg("23505", "This account already belongs to a clinic")).code, "ALREADY_HAS_CLINIC");
});

test("a missing facility ID asks for exactly what is needed", () => {
  const e = applicationError(pg("23514", 'new row violates check constraint "clinics_application_complete"'));
  assert.equal(e.code, "ID_REQUIRED");
  assert.match(e.message, /HFR ID/);
  assert.match(e.message, /registration number/);
});

test("format problems name the field", () => {
  assert.equal(applicationError(pg("23514", 'violates check constraint "clinics_gstin_check"')).code, "GSTIN_FORMAT");
  assert.equal(applicationError(pg("23514", 'violates check constraint "clinics_pincode_check"')).code, "PINCODE_FORMAT");
});
