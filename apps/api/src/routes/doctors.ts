import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { badRequest, unwrap } from "../lib/errors.js";

export const doctors = Router();

doctors.get(
  "/",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("doctors")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("sort_order")
        .order("spoken_name"),
      "doctors",
    );
    res.json(rows);
  }),
);

doctors.get(
  "/:id/sessions",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const rows = unwrap(
      await db
        .from("doctor_sessions")
        .select("*")
        .eq("doctor_id", req.params.id)
        .eq("is_active", true)
        .order("day_of_week")
        .order("starts_at"),
      "doctor sessions",
    );
    res.json(rows);
  }),
);

/** Live availability. The same RPC the voice agent uses — one source of truth. */
doctors.get(
  "/:id/availability",
  validate({ params: z.object({ id: uuid }), query: z.object({ date: isoDate }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const slots = unwrap(
      await db.rpc("get_available_slots", {
        p_doctor_id: req.params.id,
        p_date: (req.query as unknown as { date: string }).date,
      }),
      "availability",
    );
    res.json(slots);
  }),
);

// --- Doctor administration (owner/manager) ---------------------------------

const doctorBody = z.object({
  full_name: z.string().trim().min(2).max(100),
  spoken_name: z.string().trim().min(2).max(60),
  specialty: z.string().trim().min(2).max(100),
  qualifications: z.string().trim().max(200).optional(),
  registration_no: z.string().trim().max(60).optional(),
  phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  languages: z.array(z.enum(["te", "en", "hi"])).min(1).max(3),
  consult_duration_min: z.number().int().min(5).max(120),
  consult_fee_paise: z.number().int().min(0).max(10_000_00).optional(),
  followup_fee_paise: z.number().int().min(0).max(10_000_00).optional(),
  colour_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

doctors.post(
  "/",
  requireRole("owner", "manager"),
  validate({ body: doctorBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const row = unwrap(
      await db
        .from("doctors")
        .insert({ ...(req.body as z.infer<typeof doctorBody>), clinic_id: clinicId })
        .select()
        .single(),
      "doctor",
    );
    req.log.info({ doctorId: row.id }, "doctor created");
    res.status(201).json(row);
  }),
);

doctors.patch(
  "/:id",
  requireRole("owner", "manager"),
  validate({
    params: z.object({ id: uuid }),
    body: doctorBody.partial().extend({ is_active: z.boolean().optional() }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db.from("doctors").update(req.body).eq("id", req.params.id).select().single(),
      "doctor",
    );
    res.json(row);
  }),
);

/**
 * Deactivate, not delete.
 *
 * appointments references doctors with ON DELETE RESTRICT, so a real delete
 * would fail the moment the doctor has any history — and losing that history
 * is not something a clinic should be able to do by clicking a button.
 * Deactivating removes them from availability and from the AI's roster.
 */
doctors.delete(
  "/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db
        .from("doctors")
        .update({ is_active: false })
        .eq("id", req.params.id)
        .select()
        .single(),
      "doctor",
    );
    req.log.warn({ doctorId: row.id }, "doctor deactivated");
    res.json(row);
  }),
);

// --- Weekly consulting sessions --------------------------------------------

const sessionBody = z.object({
  day_of_week: z.number().int().min(0).max(6),
  starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM"),
  ends_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM"),
  slot_duration_min: z.number().int().min(5).max(120).optional(),
  capacity_per_slot: z.number().int().min(1).max(10).optional(),
  label: z.string().trim().max(40).optional(),
});

doctors.post(
  "/:id/sessions",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }), body: sessionBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as z.infer<typeof sessionBody>;
    if (b.ends_at <= b.starts_at) {
      throw badRequest("INVALID_RANGE", "The session must end after it starts.");
    }
    const row = unwrap(
      await db
        .from("doctor_sessions")
        .insert({ ...b, doctor_id: req.params.id, clinic_id: clinicId })
        .select()
        .single(),
      "doctor session",
    );
    res.status(201).json(row);
  }),
);

doctors.delete(
  "/sessions/:sessionId",
  requireRole("owner", "manager"),
  validate({ params: z.object({ sessionId: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("doctor_sessions").delete().eq("id", req.params.sessionId);
    if (error) throw error;
    res.status(204).end();
  }),
);

const timeOffBody = z.object({
  doctor_id: uuid,
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  kind: z.enum(["leave", "emergency", "conference", "hours_change", "clinic_closed"]),
  reason: z.string().max(500).optional(),
});

/**
 * Register doctor unavailability — the entry point to the trust flow.
 *
 * A database trigger flags the affected appointments as needs_reschedule, opens
 * a DRAFT batch and raises an action item. It does not cancel anyone and does
 * not message anyone. The response returns the batch so the UI can show staff
 * exactly who is affected before they decide anything.
 */
doctors.post(
  "/time-off",
  validate({ body: timeOffBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId, userId } = req.auth!;
    const body = req.body as z.infer<typeof timeOffBody>;

    const timeOff = unwrap(
      await db
        .from("doctor_time_off")
        .insert({ ...body, clinic_id: clinicId, created_by: userId })
        .select()
        .single(),
      "time off",
    );

    const batch = await db
      .from("reschedule_batches")
      .select("*")
      .eq("time_off_id", timeOff.id)
      .maybeSingle();

    req.log.warn(
      { doctorId: body.doctor_id, affected: batch.data?.total_affected ?? 0 },
      "doctor time off registered — reschedule batch opened as draft",
    );

    res.status(201).json({ time_off: timeOff, batch: batch.data });
  }),
);

doctors.delete(
  "/time-off/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("doctor_time_off").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  }),
);
