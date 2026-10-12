import type { Request } from "express";
import type { Db } from "./supabase.js";
import { AppError } from "./errors.js";

export type RecordType = "medical_record" | "patient_profile";

/**
 * Record that the caller is reading a patient's record — before serving it.
 *
 * Goes through the caller's own client: log_record_access works out who is
 * reading from the session, so this cannot be pointed at someone else.
 *
 * Fails closed. If the read cannot be recorded, the record is not served:
 * an unaudited read of health data is worse than a retry.
 */
export async function recordAccess(
  db: Pick<Db, "rpc">,
  req: Pick<Request, "id" | "log">,
  patientId: string,
  recordType: RecordType,
): Promise<void> {
  const { error } = await db.rpc("log_record_access", {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_request_id: req.id,
  });
  if (error) {
    req.log.error({ err: error, patientId, recordType }, "record access could not be logged; refusing the read");
    if (error.code === "42501") throw new AppError(403, "FORBIDDEN", "Not permitted to read this record.");
    throw new AppError(503, "AUDIT_UNAVAILABLE", "This record cannot be opened right now. Please try again.");
  }
}
