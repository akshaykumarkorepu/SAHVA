import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { badRequest, unwrap } from "../lib/errors.js";

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

// --- Operating hours -------------------------------------------------------
//
// Per-block CRUD rather than a bulk replace. A clinic usually adds or removes
// one session, and each operation being atomic on its own means a failure can
// never leave the clinic with no hours at all — which would make the AI tell
// every caller it is closed.

const hoursBody = z.object({
  day_of_week: z.number().int().min(0).max(6),
  opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM"),
  closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM"),
  label: z.string().trim().max(40).optional(),
});

clinic.post(
  "/hours",
  requireRole("owner", "manager"),
  validate({ body: hoursBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as z.infer<typeof hoursBody>;
    if (b.closes_at <= b.opens_at) {
      throw badRequest("INVALID_RANGE", "Closing time must be after opening time.");
    }
    const row = unwrap(
      await db.from("clinic_hours").insert({ ...b, clinic_id: clinicId }).select().single(),
      "clinic hours",
    );
    res.status(201).json(row);
  }),
);

clinic.delete(
  "/hours/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("clinic_hours").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  }),
);

// --- Closures (festivals, holidays) ----------------------------------------

const closureBody = z
  .object({
    starts_on: isoDate,
    ends_on: isoDate,
    reason: z.string().trim().min(2).max(120),
  })
  .refine((c) => c.ends_on >= c.starts_on, "the closure must end on or after it starts");

clinic.post(
  "/closures",
  requireRole("owner", "manager"),
  validate({ body: closureBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const row = unwrap(
      await db
        .from("clinic_closures")
        .insert({ ...(req.body as z.infer<typeof closureBody>), clinic_id: clinicId })
        .select()
        .single(),
      "closure",
    );
    res.status(201).json(row);
  }),
);

clinic.delete(
  "/closures/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("clinic_closures").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  }),
);
