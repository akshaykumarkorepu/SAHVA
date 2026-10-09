import type { NextFunction, Request, Response } from "express";
import { dbAdmin } from "../lib/supabase.js";
import { hashPortalToken, looksLikePortalToken } from "../lib/portalToken.js";
import { unauthorized } from "../lib/errors.js";

declare global {
  namespace Express {
    interface Request {
      /** Present only after `requirePortalToken`. */
      portal?: { patientId: string; clinicId: string; tokenId: string };
    }
  }
}

/**
 * Authenticates a patient by their portal link.
 *
 * The token is the only thing trusted. Everything downstream is scoped to the
 * patient and clinic it resolves to — a patient_id in a request body is never
 * read, because the holder of a link must not be able to address someone
 * else's record by changing a field.
 */
export async function requirePortalToken(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = (req.params.token ?? req.header("x-portal-token") ?? "").trim();

    // Reject on shape first, so a junk value never becomes a database round trip.
    if (!looksLikePortalToken(raw)) throw unauthorized("This link is not valid.");

    const { data, error } = await dbAdmin.rpc("resolve_patient_token", {
      p_token_hash: hashPortalToken(raw),
    });

    if (error) {
      req.log.error({ err: error }, "portal token resolution failed");
      throw unauthorized("This link could not be checked. Please try again.");
    }

    const row = Array.isArray(data) ? data[0] : null;
    // Unknown, expired and revoked are deliberately indistinguishable.
    if (!row) throw unauthorized("This link has expired. Please ask the clinic for a new one.");

    req.portal = {
      patientId: row.patient_id,
      clinicId: row.clinic_id,
      tokenId: row.token_id,
    };
    req.log = req.log.child({ portalPatient: row.patient_id, clinicId: row.clinic_id });
    next();
  } catch (err) {
    next(err);
  }
}
