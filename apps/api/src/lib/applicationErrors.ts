import type { PostgrestError } from "@supabase/supabase-js";
import { AppError, badRequest, conflict, fromPostgrest } from "./errors.js";

/**
 * Turn the database's refusals of a clinic application into sentences an
 * owner can act on. The constraint names come from migration
 * 20261012000900; anything else falls back to the general mapping.
 */
export function applicationError(e: PostgrestError): AppError {
  const m = `${e.message} ${e.details ?? ""}`;
  if (e.code === "23505") {
    if (/already belongs/.test(m)) return conflict("ALREADY_HAS_CLINIC", "This account already has a clinic.", "Sign in to open its dashboard.");
    if (/hfr_id/.test(m)) return conflict("HFR_TAKEN", "This HFR ID is already registered to another clinic on SAHVA.");
    if (/establishment_reg/.test(m)) return conflict("REGISTRATION_TAKEN", "This registration number is already registered to another clinic on SAHVA.");
    if (/gstin/.test(m)) return conflict("GSTIN_TAKEN", "This GSTIN is already registered to another clinic on SAHVA.");
    if (/phone_e164/.test(m)) return conflict("PHONE_TAKEN", "A clinic with this phone number is already registered.");
  }
  if (e.code === "23514") {
    if (/application_complete/.test(m)) {
      return badRequest(
        "ID_REQUIRED",
        "Give the clinic's HFR ID, or its state registration number and state — and the owner doctor's registration number and council.",
      );
    }
    if (/hfr_id/.test(m)) return badRequest("HFR_FORMAT", "That HFR ID does not look right — letters and numbers only.");
    if (/gstin/.test(m)) return badRequest("GSTIN_FORMAT", "That GSTIN does not look right. It is 15 characters, like 36ABCDE1234F1Z5.");
    if (/pincode/.test(m)) return badRequest("PINCODE_FORMAT", "A PIN code is 6 digits.");
  }
  return fromPostgrest(e, "saving the application");
}
