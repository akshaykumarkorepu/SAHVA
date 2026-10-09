import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requirePortalToken } from "../middleware/portalAuth.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { badRequest, forbidden, fromPostgrest, notFound, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";

export const portal = Router();

/**
 * The patient-facing portal.
 *
 * Unauthenticated in the staff sense: a patient proves who they are by holding
 * the link the clinic sent to their phone. Every route below is mounted behind
 * `requirePortalToken`, and every query is scoped to `req.portal.patientId` —
 * never to anything the request body claims.
 */
portal.use("/:token", requirePortalToken);

/** Settings that decide what the patient is allowed to do for themselves. */
async function portalSettings(clinicId: string) {
  const { data } = await dbAdmin
    .from("clinic_settings")
    .select("portal_enabled, patient_may_reschedule, patient_may_cancel, min_notice_minutes, cancellation_window_min")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  return {
    portal_enabled: data?.portal_enabled ?? true,
    patient_may_reschedule: data?.patient_may_reschedule ?? true,
    patient_may_cancel: data?.patient_may_cancel ?? false,
    min_notice_minutes: data?.min_notice_minutes ?? 30,
    cancellation_window_min: data?.cancellation_window_min ?? 120,
  };
}

/**
 * Everything the portal home page needs, in one request — a patient on a
 * patchy 3G connection in Warangal should not wait on four round trips.
 */
portal.get(
  "/:token",
  asyncRoute(async (req, res) => {
    const { patientId, clinicId } = req.portal!;
    const settings = await portalSettings(clinicId);

    if (!settings.portal_enabled) {
      throw forbidden("This clinic has turned off online appointment management.");
    }

    const [patient, clinic, appointments] = await Promise.all([
      dbAdmin
        .from("patients")
        .select("id, full_name, phone_e164, preferred_language")
        .eq("id", patientId)
        .single(),
      dbAdmin
        .from("clinics")
        .select("id, name, phone_e164, whatsapp_e164, address_line, landmark, city, pincode, map_url, timezone, default_language")
        .eq("id", clinicId)
        .single(),
      dbAdmin
        .from("v_patient_appointments")
        .select("*")
        .eq("patient_id", patientId)
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);

    const rows = appointments.data ?? [];
    const now = Date.now();

    res.json({
      patient: unwrap(patient, "patient"),
      clinic: unwrap(clinic, "clinic"),
      permissions: {
        may_reschedule: settings.patient_may_reschedule,
        may_cancel: settings.patient_may_cancel,
      },
      upcoming: rows
        .filter(
          (a) =>
            new Date(a.starts_at!).getTime() >= now &&
            ["booked", "confirmed", "checked_in", "needs_reschedule"].includes(a.status!),
        )
        .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime()),
      past: rows.filter(
        (a) =>
          new Date(a.starts_at!).getTime() < now ||
          ["completed", "cancelled", "no_show"].includes(a.status!),
      ),
    });
  }),
);

/** Clinic hours, so the portal can answer "are you open?" without a call. */
portal.get(
  "/:token/hours",
  asyncRoute(async (req, res) => {
    const { clinicId } = req.portal!;
    const [hours, closures] = await Promise.all([
      dbAdmin.from("clinic_hours").select("*").eq("clinic_id", clinicId).order("day_of_week"),
      dbAdmin
        .from("clinic_closures")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("ends_on", new Date().toISOString().slice(0, 10))
        .order("starts_on"),
    ]);
    res.json({ hours: hours.data ?? [], closures: closures.data ?? [] });
  }),
);

/**
 * Confirm an appointment.
 *
 * The cheapest thing a patient can do that the clinic actually values: a tap
 * here is a no-show that probably will not happen.
 */
portal.post(
  "/:token/appointments/:id/confirm",
  validate({ params: z.object({ token: z.string(), id: uuid }) }),
  asyncRoute(async (req, res) => {
    const appt = await ownedAppointment(req.portal!.patientId, req.params.id);

    if (!["booked", "confirmed"].includes(appt.status)) {
      throw badRequest("NOT_CONFIRMABLE", "This appointment can no longer be confirmed.");
    }

    const row = unwrap(
      await dbAdmin
        .from("appointments")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", appt.id)
        .select()
        .single(),
      "appointment",
    );

    await dbAdmin.from("appointment_events").insert({
      clinic_id: appt.clinic_id,
      appointment_id: appt.id,
      event: "confirmed",
      actor_type: "patient",
      note: "Confirmed by the patient from the portal",
    });

    req.log.info({ appointmentId: appt.id }, "patient confirmed appointment");
    res.json(row);
  }),
);

/** Free slots for the appointment's own doctor — the patient cannot pick another. */
portal.get(
  "/:token/appointments/:id/slots",
  validate({ params: z.object({ token: z.string(), id: uuid }), query: z.object({ date: isoDate }) }),
  asyncRoute(async (req, res) => {
    const { clinicId } = req.portal!;
    const settings = await portalSettings(clinicId);
    if (!settings.patient_may_reschedule) {
      throw forbidden("Please call the clinic to change this appointment.");
    }

    const appt = await ownedAppointment(req.portal!.patientId, req.params.id);
    const slots = unwrap(
      await dbAdmin.rpc("get_available_slots", {
        p_doctor_id: appt.doctor_id,
        p_date: (req.query as unknown as { date: string }).date,
      }),
      "availability",
    );
    res.json(slots);
  }),
);

portal.post(
  "/:token/appointments/:id/reschedule",
  validate({
    params: z.object({ token: z.string(), id: uuid }),
    body: z.object({ new_starts_at: z.string().datetime({ offset: true }) }),
  }),
  asyncRoute(async (req, res) => {
    const { clinicId } = req.portal!;
    const settings = await portalSettings(clinicId);
    if (!settings.patient_may_reschedule) {
      throw forbidden("Please call the clinic to change this appointment.");
    }

    const appt = await ownedAppointment(req.portal!.patientId, req.params.id);

    // Same guarded RPC the AI and the front desk use: availability is
    // re-checked inside the transaction and the EXCLUDE constraint is final.
    const { data, error } = await dbAdmin.rpc("reschedule_appointment", {
      p_appointment_id: appt.id,
      p_new_starts_at: (req.body as { new_starts_at: string }).new_starts_at,
      p_actor: "patient",
    });
    if (error) throw fromPostgrest(error, "rescheduling the appointment");

    req.log.info({ from: appt.id, to: data.id }, "patient rescheduled appointment");
    res.json(data);
  }),
);

portal.post(
  "/:token/appointments/:id/cancel",
  validate({
    params: z.object({ token: z.string(), id: uuid }),
    body: z.object({ reason: z.string().max(300).optional() }),
  }),
  asyncRoute(async (req, res) => {
    const { clinicId } = req.portal!;
    const settings = await portalSettings(clinicId);

    // Off by default: a cancellation the clinic never hears about is a lost slot.
    if (!settings.patient_may_cancel) {
      throw forbidden("Please call the clinic to cancel this appointment.");
    }

    const appt = await ownedAppointment(req.portal!.patientId, req.params.id);

    const minutesAway = (new Date(appt.starts_at).getTime() - Date.now()) / 60000;
    if (minutesAway < settings.cancellation_window_min) {
      throw badRequest(
        "TOO_LATE_TO_CANCEL",
        `Cancellations need ${settings.cancellation_window_min} minutes' notice. Please call the clinic.`,
      );
    }

    const { data, error } = await dbAdmin.rpc("cancel_appointment", {
      p_appointment_id: appt.id,
      p_actor: "patient",
      p_reason: (req.body as { reason?: string }).reason ?? "Cancelled by the patient online",
    });
    if (error) throw fromPostgrest(error, "cancelling the appointment");

    req.log.warn({ appointmentId: appt.id }, "patient cancelled appointment");
    res.json(data);
  }),
);

/**
 * Load an appointment and prove it belongs to this patient.
 *
 * The single most important check in this file. Without it, holding any valid
 * link would let someone act on any appointment id they could guess.
 */
async function ownedAppointment(patientId: string, appointmentId: string) {
  const { data, error } = await dbAdmin
    .from("appointments")
    .select("id, clinic_id, doctor_id, patient_id, starts_at, status")
    .eq("id", appointmentId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) throw fromPostgrest(error, "appointment");
  if (!data) throw notFound("Appointment");
  return data;
}
