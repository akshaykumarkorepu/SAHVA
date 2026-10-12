import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { isoDate, paginationQuery, phoneE164, uuid, validate } from "../middleware/validate.js";
import { conflict, fromPostgrest, unwrap } from "../lib/errors.js";
import { localDay } from "../lib/queue.js";

export const appointments = Router();

const SELECT =
  "*, doctors(id, spoken_name, specialty, colour_hex), patients(id, full_name, phone_e164, preferred_language)";

const listQuery = paginationQuery.extend({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z
    .enum([
      "booked",
      "confirmed",
      "checked_in",
      "completed",
      "cancelled",
      "no_show",
      "needs_reschedule",
    ])
    .optional(),
  doctor_id: uuid.optional(),
});

appointments.get(
  "/",
  validate({ query: listQuery }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const q = req.query as unknown as z.infer<typeof listQuery>;

    let query = db
      .from("appointments")
      .select(SELECT, { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("starts_at", { ascending: true })
      .range(q.offset, q.offset + q.limit - 1);

    if (q.from) query = query.gte("starts_at", q.from);
    if (q.to) query = query.lte("starts_at", q.to);
    if (q.status) query = query.eq("status", q.status);
    if (q.doctor_id) query = query.eq("doctor_id", q.doctor_id);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0, limit: q.limit, offset: q.offset });
  }),
);

/** Today's board, in clinic-local time. Reads the view so the timezone maths lives in one place. */
appointments.get(
  "/today",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("v_todays_appointments")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("starts_at"),
      "today's appointments",
    );
    res.json(rows);
  }),
);

/** Everything needing staff attention because a doctor became unavailable. */
appointments.get(
  "/needs-reschedule",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("appointments")
        .select(SELECT)
        .eq("clinic_id", clinicId)
        .eq("status", "needs_reschedule")
        .order("starts_at"),
      "appointments",
    );
    res.json(rows);
  }),
);

appointments.get(
  "/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const [appt, events] = await Promise.all([
      db.from("appointments").select(SELECT).eq("id", req.params.id).single(),
      // The audit trail: proof that nothing changed behind the patient's back.
      db
        .from("appointment_events")
        .select("*")
        .eq("appointment_id", req.params.id)
        .order("created_at", { ascending: false }),
    ]);
    res.json({ ...unwrap(appt, "appointment"), events: events.data ?? [] });
  }),
);

const bookBody = z.object({
  doctor_id: uuid,
  patient_name: z.string().min(1).max(100),
  phone: phoneE164,
  starts_at: z.string().datetime({ offset: true }),
  reason: z.string().max(500).optional(),
  language: z.enum(["te", "en", "hi"]).optional(),
});

/**
 * Staff booking. Goes through the same guarded RPC the AI uses — availability
 * is re-checked inside the transaction, and the EXCLUDE constraint is the final
 * word. The front desk gets exactly the same guarantees as the phone line.
 */
appointments.post(
  "/",
  validate({ body: bookBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as z.infer<typeof bookBody>;

    const { data, error } = await db.rpc("book_appointment", {
      p_clinic_id: clinicId,
      p_doctor_id: b.doctor_id,
      p_patient_name: b.patient_name,
      p_phone_e164: b.phone,
      p_starts_at: b.starts_at,
      p_reason: b.reason ?? undefined,
      p_source: "staff_manual",
      p_language: b.language ?? undefined,
    });
    if (error) throw fromPostgrest(error, "booking the appointment");
    res.status(201).json(data);
  }),
);

/**
 * Walk-in fast pass: a patient at the counter gets the doctor's next free
 * slot today and their token, in one request.
 *
 * Same rules as any booking — the slot comes from get_available_slots, so
 * the clinic's minimum notice and the doctor's leave still apply. If another
 * booking takes that slot in the same moment, it moves to the next one rather
 * than sending the receptionist back to start over.
 */
appointments.post(
  "/walk-in",
  validate({
    body: z.object({
      doctor_id: uuid,
      patient_name: z.string().trim().min(2).max(100),
      phone: phoneE164,
    }),
  }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as { doctor_id: string; patient_name: string; phone: string };

    const clinic = unwrap(await db.from("clinics").select("timezone").eq("id", clinicId).single(), "clinic");
    const today = localDay(new Date().toISOString(), clinic.timezone);
    const slots = unwrap(
      await db.rpc("get_available_slots", { p_doctor_id: b.doctor_id, p_date: today }),
      "availability",
    );
    if (slots.length === 0) {
      throw conflict("NO_SLOT_TODAY", "This doctor has no free time left today.", "Offer another doctor or tomorrow.");
    }

    for (const slot of slots.slice(0, 3)) {
      const { data, error } = await db.rpc("book_appointment", {
        p_clinic_id: clinicId,
        p_doctor_id: b.doctor_id,
        p_patient_name: b.patient_name,
        p_phone_e164: b.phone,
        p_starts_at: slot.slot_start,
        p_source: "walk_in",
      });
      if (!error) {
        res.status(201).json(data);
        return;
      }
      if (error.code !== "23P01") throw fromPostgrest(error, "booking the walk-in");
    }
    throw conflict("SLOT_TAKEN", "The next free times were all just taken.", "Try again.");
  }),
);

appointments.post(
  "/:id/reschedule",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      new_starts_at: z.string().datetime({ offset: true }),
      new_doctor_id: uuid.optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const b = req.body as { new_starts_at: string; new_doctor_id?: string };
    const { data, error } = await db.rpc("reschedule_appointment", {
      p_appointment_id: req.params.id,
      p_new_starts_at: b.new_starts_at,
      p_new_doctor_id: b.new_doctor_id,
      p_actor: "staff",
    });
    if (error) throw fromPostgrest(error, "rescheduling the appointment");
    res.json(data);
  }),
);

appointments.post(
  "/:id/cancel",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ reason: z.string().max(500).optional() }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { data, error } = await db.rpc("cancel_appointment", {
      p_appointment_id: req.params.id,
      p_actor: "staff",
      p_reason: (req.body as { reason?: string }).reason,
    });
    if (error) throw fromPostgrest(error, "cancelling the appointment");
    res.json(data);
  }),
);

/**
 * Front-desk day flow: confirm, check in, complete, or mark a no-show.
 *
 * Goes through set_appointment_status so the change and its audit event are
 * one transaction. This route used to insert the event itself through the
 * caller's RLS-scoped client — which staff are not allowed to do — and ignored
 * the refusal, so none of these changes ever reached appointment_events.
 */
appointments.post(
  "/:id/status",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ status: z.enum(["confirmed", "checked_in", "completed", "no_show"]) }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { data, error } = await db.rpc("set_appointment_status", {
      p_appointment_id: req.params.id,
      p_status: (req.body as { status: "confirmed" | "checked_in" | "completed" | "no_show" }).status,
    });
    if (error) throw fromPostgrest(error, "updating the appointment");
    res.json(data);
  }),
);
