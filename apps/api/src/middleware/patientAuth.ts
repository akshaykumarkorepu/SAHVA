import type { NextFunction, Request, Response } from "express";
import { dbForUser, verifyAccessToken, type Db } from "../lib/supabase.js";
import { forbidden, unauthorized } from "../lib/errors.js";

declare global {
  namespace Express {
    interface Request {
      /** Present only after `requirePatientAuth`. */
      patient?: { userId: string; patientId: string; clinicId: string; db: Db };
    }
  }
}

/**
 * Authenticates a signed-in patient.
 *
 * Mirrors requireAuth on the staff side, but resolves a patient record rather
 * than a clinic membership. The patient id comes from `patients.auth_user_id`
 * — never from the request — and the attached client is RLS-scoped, so the
 * policies in migration 1800 decide which rows exist rather than this code.
 */
export async function requirePatientAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized("Please sign in.");

    const token = header.slice("Bearer ".length).trim();
    if (!token) throw unauthorized("Please sign in.");

    const user = await verifyAccessToken(token);
    if (!user) throw unauthorized("Your session has expired. Please sign in again.");

    const db = dbForUser(token);

    // Read through the patient's own RLS-scoped client: if the account is not
    // linked to a patient record, this simply returns nothing.
    const { data, error } = await db
      .from("patients")
      .select("id, clinic_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      req.log.error({ err: error }, "patient lookup failed");
      throw unauthorized("Could not load your record.");
    }
    if (!data) {
      throw forbidden(
        "This account is not linked to a patient record. Open the link your clinic sent you.",
      );
    }

    req.patient = { userId: user.id, patientId: data.id, clinicId: data.clinic_id, db };
    req.log = req.log.child({ patientId: data.id });
    next();
  } catch (err) {
    next(err);
  }
}
