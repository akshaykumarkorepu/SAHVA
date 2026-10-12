import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { logAdminAction } from "../lib/adminAudit.js";
import { overview } from "../lib/adminMetrics.js";

/**
 * The admin API. Mounted behind requirePlatformAdmin, so every handler here
 * already knows it is talking to an admin who passed a second factor. Reads
 * use the service role because they span every clinic.
 */
export const admin = Router();

admin.get(
  "/me",
  asyncRoute(async (req, res) => {
    const a = req.admin!;
    res.json({ email: a.email, role: a.role, full_name: a.fullName });
  }),
);

/** Called once after sign-in completes, so every admin session is on record. */
admin.post(
  "/sessions",
  asyncRoute(async (req, res) => {
    await logAdminAction(req, { action: "admin.sign_in" });
    res.status(201).json({ ok: true });
  }),
);

admin.get(
  "/overview",
  asyncRoute(async (_req, res) => {
    const [clinics, subs, payments, plan] = await Promise.all([
      dbAdmin.from("clinics").select("created_at"),
      dbAdmin.from("subscriptions").select("clinic_id, status, billing_cycle, current_period_end, trial_ends_at"),
      dbAdmin.from("subscription_payments").select("amount_paise, paid_at, status"),
      dbAdmin.from("plans").select("monthly_price_paise, yearly_price_paise").eq("code", "starter").single(),
    ]);
    res.json(
      overview({
        clinics: unwrap(clinics, "clinics"),
        subs: unwrap(subs, "subscriptions"),
        payments: unwrap(payments, "payments"),
        price: unwrap(plan, "plan"),
      }),
    );
  }),
);

admin.get(
  "/audit",
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }) }),
  asyncRoute(async (req, res) => {
    const { limit } = req.query as unknown as { limit: number };
    const rows = unwrap(
      await dbAdmin
        .from("admin_audit_log")
        .select("id, action, target_type, target_id, reason, created_at, platform_admins(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit),
      "admin audit log",
    );
    res.json(rows);
  }),
);
