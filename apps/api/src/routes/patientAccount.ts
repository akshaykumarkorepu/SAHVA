import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requirePatientAuth } from "../middleware/patientAuth.js";
import { requirePortalToken } from "../middleware/portalAuth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { badRequest, fromPostgrest, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";

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
