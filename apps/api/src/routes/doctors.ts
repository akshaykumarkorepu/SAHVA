import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

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
