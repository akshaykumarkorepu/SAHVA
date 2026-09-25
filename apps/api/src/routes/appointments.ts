import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { isoDate, paginationQuery, phoneE164, uuid, validate } from "../middleware/validate.js";
import { fromPostgrest, unwrap } from "../lib/errors.js";
import type { TablesUpdate } from "@sahva/types";

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

const STATUS_TIMESTAMP = {
  confirmed: "confirmed_at",
  checked_in: "checked_in_at",
  completed: "completed_at",
} as const;

/** Front-desk day flow: confirm, check in, complete, or mark a no-show. */
appointments.post(
  "/:id/status",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ status: z.enum(["confirmed", "checked_in", "completed", "no_show"]) }),
  }),
  asyncRoute(async (req, res) => {
    const { db, clinicId, userId } = req.auth!;
    const { status } = req.body as { status: keyof typeof STATUS_TIMESTAMP | "no_show" };

    const patch: TablesUpdate<"appointments"> = { status };
    if (status !== "no_show") patch[STATUS_TIMESTAMP[status]] = new Date().toISOString();

    const row = unwrap(
      await db.from("appointments").update(patch).eq("id", req.params.id).select().single(),
      "appointment",
    );

    await db.from("appointment_events").insert({
      clinic_id: clinicId,
      appointment_id: row.id,
      event: status === "no_show" ? "no_show" : status,
      actor_type: "staff",
      actor_staff_id: userId,
    });

    res.json(row);
  }),
);
