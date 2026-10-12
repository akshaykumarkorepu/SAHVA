import type { Request } from "express";
import type { Json } from "@sahva/types";
import { dbAdmin } from "./supabase.js";
import { AppError } from "./errors.js";

export type AdminAction = {
  /** "area.verb", e.g. "admin.sign_in", "clinic.approve". */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Required by callers for anything touching money or access. */
  reason?: string;
  before?: Json;
  after?: Json;
};

/**
 * Record an admin action. Fails closed: if the record cannot be written the
 * caller must not go ahead, so an admin can never act without a trace.
 */
export async function logAdminAction(req: Pick<Request, "admin" | "id" | "log">, a: AdminAction): Promise<void> {
  if (!req.admin) throw new AppError(401, "UNAUTHORIZED", "Not signed in as an admin.");
  const { error } = await dbAdmin.from("admin_audit_log").insert({
    admin_user_id: req.admin.userId,
    action: a.action,
    target_type: a.targetType ?? null,
    target_id: a.targetId ?? null,
    reason: a.reason ?? null,
    before: a.before ?? null,
    after: a.after ?? null,
    request_id: req.id,
  });
  if (error) {
    req.log.error({ err: error, action: a.action }, "admin audit write failed; refusing the action");
    throw new AppError(503, "AUDIT_UNAVAILABLE", "This action could not be recorded, so it was not carried out.");
  }
}
