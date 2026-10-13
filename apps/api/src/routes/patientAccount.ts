import { Router } from "express";
import { recordAccess } from "../lib/audit.js";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requirePatientAuth } from "../middleware/patientAuth.js";
import { requirePortalToken } from "../middleware/portalAuth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { badRequest, forbidden, fromPostgrest, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { clinicProfile } from "../lib/clinicProfile.js";

export const patientAccount = Router();

/* -------------------------------------------------------------------------- */
/* Signing up — from a portal link                                             */
/* -------------------------------------------------------------------------- */

const signupBody = z.object({
  email: z.string().trim().email().max(150),
  // Length over composition rules: a long passphrase beats "P@ssw0rd!", and
  // arbitrary symbol requirements mostly produce written-down passwords.
  password: z.string().min(10).max(200),
});

/**
 * Create an account from a portal link.
 *
 * The link is the verification step. Holding it already proves possession of
 * the phone the clinic has on file — the same thing an SMS OTP would prove —
 * so no second factor is invented here.
 *
 * Rate limited hard, and `claim_patient_account` refuses to re-point a record
 * that someone else has already claimed.
 */
patientAccount.post(
  "/portal/:token/account",
  authLimiter(),
  requirePortalToken,
  validate({ body: signupBody }),
  asyncRoute(async (req, res) => {
    const { patientId, clinicId } = req.portal!;
    const b = req.body as z.infer<typeof signupBody>;

    const patient = unwrap(
      await dbAdmin.from("patients").select("id, full_name, auth_user_id").eq("id", patientId).single(),
      "patient",
    );

    if (patient.auth_user_id) {
      throw badRequest(
        "ALREADY_CLAIMED",
        "This record already has an account. Please sign in instead.",
      );
    }

    const created = await dbAdmin.auth.admin.createUser({
      email: b.email,
      password: b.password,
      email_confirm: true, // the link already proved who they are
      user_metadata: { full_name: patient.full_name, account_type: "patient" },
    });

    if (created.error || !created.data.user) {
      // Do not reveal whether the address is already registered.
      req.log.warn({ err: created.error }, "patient signup failed");
      throw badRequest(
        "SIGNUP_FAILED",
        "Could not create the account. If you already have one, please sign in.",
      );
    }

    const { error } = await dbAdmin.rpc("claim_patient_account", {
      p_patient_id: patientId,
      p_auth_user_id: created.data.user.id,
    });

    if (error) {
      // Do not leave an orphan login behind if the claim loses a race.
      await dbAdmin.auth.admin.deleteUser(created.data.user.id).catch(() => undefined);
      throw fromPostgrest(error, "linking the account");
    }

    req.log.info({ patientId, clinicId }, "patient account created from portal link");
    res.status(201).json({ ok: true, email: b.email });
  }),
);

/* -------------------------------------------------------------------------- */
/* Signed-in patient                                                           */
/* -------------------------------------------------------------------------- */

patientAccount.use("/me", requirePatientAuth);

/** Profile, clinic and appointments. */
patientAccount.get(
  "/me",
  asyncRoute(async (req, res) => {
    const { db, patientId, clinicId } = req.patient!;

    const [patient, clinic, appointments] = await Promise.all([
      db.from("patients").select("*").eq("id", patientId).single(),
      db.from("clinics").select("*").eq("id", clinicId).single(),
      db
        .from("v_patient_appointments")
        .select("*")
        .eq("patient_id", patientId)
        .order("starts_at", { ascending: false })
        .limit(100),
    ]);

    const rows = appointments.data ?? [];
    const now = Date.now();

    res.json({
      patient: unwrap(patient, "patient"),
      clinic: unwrap(clinic, "clinic"),
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

/**
 * The medical record.
 *
 * Only reachable with a password — a forwarded portal link must not expose a
 * diagnosis. RLS does the scoping; this route just assembles the pieces.
 */
patientAccount.get(
  "/me/medical",
  asyncRoute(async (req, res) => {
    const { db, patientId } = req.patient!;
    await recordAccess(db, req, patientId, "medical_record");

    const [history, prescriptions, conditions, vaccinations] = await Promise.all([
      db
        .from("v_patient_medical_history")
        .select("*")
        .eq("patient_id", patientId)
        .order("finalised_at", { ascending: false })
        .limit(50),
      db
        .from("v_patient_prescriptions")
        .select("*")
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false })
        .limit(50),
      db
        .from("patient_conditions")
        .select("*")
        .eq("patient_id", patientId)
        .order("status")
        .order("onset_date", { ascending: false }),
      db
        .from("patient_vaccinations")
        .select("*, vaccine_catalogue(name, description, recommended_age_weeks)")
        .eq("patient_id", patientId)
        .order("due_date"),
    ]);

    res.json({
      visits: history.data ?? [],
      prescriptions: prescriptions.data ?? [],
      conditions: conditions.data ?? [],
      vaccinations: vaccinations.data ?? [],
    });
  }),
);

/** Invoices and receipts. */
patientAccount.get(
  "/me/invoices",
  asyncRoute(async (req, res) => {
    const { db, patientId } = req.patient!;
    const [invoices, items] = await Promise.all([
      db
        .from("patient_invoices")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("patient_invoice_items").select("*"),
    ]);

    const byInvoice = new Map<string, typeof items.data>();
    for (const i of items.data ?? []) {
      byInvoice.set(i.invoice_id, [...(byInvoice.get(i.invoice_id) ?? []), i]);
    }

    res.json(
      (invoices.data ?? []).map((inv) => ({ ...inv, items: byInvoice.get(inv.id) ?? [] })),
    );
  }),
);

/**
 * Care follow-ups the clinic has scheduled for this patient.
 *
 * The task row carries no text of its own — what to do lives on the care plan
 * it came from, so the plan's name is joined in rather than duplicated per
 * task. Completed and skipped tasks are left out: this is a to-do list, not an
 * audit trail, and the record of what happened is the visit history.
 */
patientAccount.get(
  "/me/tasks",
  asyncRoute(async (req, res) => {
    const { db, patientId } = req.patient!;

    const tasks = await db
      .from("care_tasks")
      .select("id, due_on, status, care_plans(name, template_key)")
      .eq("patient_id", patientId)
      .in("status", ["pending", "sent"])
      .order("due_on")
      .limit(50);

    if (tasks.error) throw fromPostgrest(tasks.error, "care task");

    res.json(
      (tasks.data ?? []).map((t) => {
        // PostgREST types an embedded one-to-one as an array in some versions.
        const plan = Array.isArray(t.care_plans) ? t.care_plans[0] : t.care_plans;
        return {
          id: t.id,
          due_on: t.due_on,
          status: t.status,
          title: plan?.name ?? "Follow-up",
          template_key: plan?.template_key ?? null,
        };
      }),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Your clinic: doctors, hours, services — and booking                         */
/* -------------------------------------------------------------------------- */

/** Every clinic this login is a patient at, for the switcher. */
patientAccount.get(
  "/me/clinics",
  asyncRoute(async (req, res) => {
    const { userId } = req.patient!;
    const rows = unwrap(
      await dbAdmin
        .from("patients")
        .select("id, clinic_id, full_name, clinics(name, city)")
        .eq("auth_user_id", userId)
        .order("created_at", { ascending: true }),
      "clinics",
    );
    res.json(
      rows.map((r) => ({
        clinic_id: r.clinic_id,
        patient_name: r.full_name,
        name: (r.clinics as { name: string } | null)?.name ?? "",
        city: (r.clinics as { city: string } | null)?.city ?? "",
        current: r.clinic_id === req.patient!.clinicId,
      })),
    );
  }),
);

/**
 * The clinic's public face for its own patients: doctors with speciality,
 * languages, fee and weekly timings; clinic hours; upcoming closures;
 * services; FAQs. Nothing here is about other patients, and no doctor's
 * registration number or phone is exposed.
 */
patientAccount.get(
  "/me/clinic",
  asyncRoute(async (req, res) => {
    const { clinicId } = req.patient!;
    const [profile, settings] = await Promise.all([
      clinicProfile(clinicId),
      dbAdmin.from("clinic_settings").select("patient_may_book, booking_horizon_days, min_notice_minutes").eq("clinic_id", clinicId).maybeSingle(),
    ]);
    res.json({
      ...profile,
      booking: {
        enabled: settings.data?.patient_may_book ?? true,
        horizon_days: settings.data?.booking_horizon_days ?? 30,
        min_notice_minutes: settings.data?.min_notice_minutes ?? 30,
      },
    });
  }),
);

async function bookingRules(clinicId: string) {
  const { data } = await dbAdmin
    .from("clinic_settings")
    .select("patient_may_book, booking_horizon_days, min_notice_minutes")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return {
    enabled: data?.patient_may_book ?? true,
    horizonDays: data?.booking_horizon_days ?? 30,
    minNoticeMin: data?.min_notice_minutes ?? 30,
  };
}

async function clinicDoctor(clinicId: string, doctorId: string) {
  const { data } = await dbAdmin
    .from("doctors")
    .select("id")
    .eq("id", doctorId)
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) throw badRequest("UNKNOWN_DOCTOR", "That doctor is not available at your clinic.");
}

/** Free slots for one of the clinic's doctors on a day, within the clinic's booking rules. */
patientAccount.get(
  "/me/slots",
  validate({ query: z.object({ doctor_id: uuid, date: isoDate }) }),
  asyncRoute(async (req, res) => {
    const { clinicId } = req.patient!;
    const q = req.query as unknown as { doctor_id: string; date: string };
    const rules = await bookingRules(clinicId);
    if (!rules.enabled) throw forbidden("Please call the clinic to book.");
    await clinicDoctor(clinicId, q.doctor_id);
    const slots = unwrap(await dbAdmin.rpc("get_available_slots", { p_doctor_id: q.doctor_id, p_date: q.date }), "availability");
    const earliest = Date.now() + rules.minNoticeMin * 60_000;
    const latest = Date.now() + rules.horizonDays * 86_400_000;
    res.json(
      (slots ?? []).filter((s: { slot_start: string; remaining: number }) => {
        const t = new Date(s.slot_start).getTime();
        return s.remaining > 0 && t >= earliest && t <= latest;
      }),
    );
  }),
);

/** Upcoming online bookings one patient may hold at once — enough for real use, not for blocking a diary. */
export const MAX_OPEN_WEB_BOOKINGS = 2;

/**
 * Book a free slot for the signed-in patient. The same guarded RPC as the AI
 * and the front desk: availability is re-checked in the transaction, the
 * exclusion constraint is final, and a clinic that is not live refuses.
 */
patientAccount.post(
  "/me/appointments",
  authLimiter(),
  validate({
    body: z.object({
      doctor_id: uuid,
      starts_at: z.string().datetime({ offset: true }),
      reason: z.string().trim().max(200).optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const { clinicId, patientId } = req.patient!;
    const b = req.body as { doctor_id: string; starts_at: string; reason?: string };
    const rules = await bookingRules(clinicId);
    if (!rules.enabled) throw forbidden("Please call the clinic to book.");
    await clinicDoctor(clinicId, b.doctor_id);

    const t = new Date(b.starts_at).getTime();
    if (t < Date.now() + rules.minNoticeMin * 60_000 || t > Date.now() + rules.horizonDays * 86_400_000) {
      throw badRequest("OUTSIDE_BOOKING_WINDOW", "That time can no longer be booked online. Please pick another.");
    }

    const open = await dbAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("source", "web")
      .in("status", ["booked", "confirmed"])
      .gte("starts_at", new Date().toISOString());
    if ((open.count ?? 0) >= MAX_OPEN_WEB_BOOKINGS) {
      throw badRequest("TOO_MANY_BOOKINGS", "You already have upcoming online bookings. Please call the clinic for more.");
    }

    const patient = unwrap(
      await dbAdmin.from("patients").select("full_name, phone_e164, preferred_language").eq("id", patientId).single(),
      "patient",
    );
    const { data, error } = await dbAdmin.rpc("book_appointment", {
      p_clinic_id: clinicId,
      p_doctor_id: b.doctor_id,
      p_patient_name: patient.full_name,
      p_phone_e164: patient.phone_e164,
      p_starts_at: b.starts_at,
      p_reason: (b.reason ?? null) as never,
      p_source: "web",
      p_language: (patient.preferred_language ?? null) as never,
    });
    if (error) throw fromPostgrest(error, "booking the appointment");
    if (data.patient_id !== patientId) {
      // book_appointment matches patients by clinic, phone and name; this
      // must always be the signed-in patient's own record.
      req.log.error({ booked: data.id, expected: patientId, got: data.patient_id }, "web booking matched another patient record");
    }
    req.log.info({ appointmentId: data.id }, "patient booked online");
    res.status(201).json(data);
  }),
);
