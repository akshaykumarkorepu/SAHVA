import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

export const clinic = Router();

/** The signed-in user's clinic, with settings. */
clinic.get(
  "/",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const [row, settings] = await Promise.all([
      db.from("clinics").select("*").eq("id", clinicId).single(),
      db.from("clinic_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
    ]);
    res.json({ ...unwrap(row, "clinic"), settings: settings.data });
  }),
);

/**
 * Who the caller is, and what they may do. The UI uses this to hide actions a
 * receptionist cannot perform — RLS still enforces it server-side.
 */
clinic.get(
  "/me",
  asyncRoute(async (req, res) => {
    const { userId, email, clinicId, role } = req.auth!;
    res.json({ user_id: userId, email, clinic_id: clinicId, role });
  }),
);

clinic.get(
  "/hours",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db.from("clinic_hours").select("*").eq("clinic_id", clinicId).order("day_of_week"),
      "clinic hours",
    );
    res.json(rows);
  }),
);

clinic.get(
  "/closures",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("clinic_closures")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("ends_on", new Date().toISOString().slice(0, 10))
        .order("starts_on"),
      "closures",
    );
    res.json(rows);
  }),
);

const settingsPatch = z
  .object({
    ai_enabled: z.boolean(),
    ai_answers_after_hours: z.boolean(),
    ai_may_book: z.boolean(),
    ai_may_reschedule: z.boolean(),
    ai_may_cancel: z.boolean(),
    booking_horizon_days: z.number().int().min(1).max(180),
    min_notice_minutes: z.number().int().min(0).max(1440),
    reminder_hours_before: z.number().int().min(1).max(72),
    send_confirmations: z.boolean(),
    send_reminders: z.boolean(),
    greeting_te: z.string().max(500).nullable(),
    greeting_en: z.string().max(500).nullable(),
    escalation_phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable(),
    escalation_keywords: z.array(z.string().min(1).max(60)).max(40),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "no fields to update");

/** Configuration is owner/manager only — RLS enforces the same rule. */
clinic.patch(
  "/settings",
  requireRole("owner", "manager"),
  validate({ body: settingsPatch }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const row = unwrap(
      await db.from("clinic_settings").update(req.body).eq("clinic_id", clinicId).select().single(),
      "clinic settings",
    );
    req.log.info({ fields: Object.keys(req.body) }, "clinic settings updated");
    res.json(row);
  }),
);
