import express, { Router } from "express";
import { dbAdmin } from "../lib/supabase.js";
import { applicationError } from "../lib/applicationErrors.js";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { badRequest, fromPostgrest, unwrap } from "../lib/errors.js";

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

// --- Verification -------------------------------------------------------------

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : ""));

/**
 * The owner corrects the application — while it waits, or after a reviewer
 * asked for more information, which resubmits it.
 */
clinic.patch(
  "/application",
  requireRole("owner"),
  validate({
    body: z.object({
      hfr_id: optionalText(32),
      establishment_reg_no: optionalText(64),
      registration_state: optionalText(60),
      owner_reg_no: z.string().trim().min(3).max(32),
      owner_council: z.string().trim().min(3).max(120),
      gstin: optionalText(15),
    }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const b = req.body as Record<string, string>;
    const { data, error } = await db.rpc("update_clinic_application", {
      p_hfr_id: b.hfr_id,
      p_est_reg_no: b.establishment_reg_no,
      p_reg_state: b.registration_state,
      p_owner_reg_no: b.owner_reg_no,
      p_owner_council: b.owner_council,
      p_gstin: b.gstin,
    });
    if (error) throw applicationError(error);
    res.json(data);
  }),
);

const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const EXT: Record<(typeof DOC_TYPES)[number], string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

clinic.get(
  "/documents",
  requireRole("owner", "manager"),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("clinic_documents")
        .select("id, kind, file_name, content_type, size_bytes, uploaded_at")
        .eq("clinic_id", clinicId)
        .order("uploaded_at", { ascending: false }),
      "documents",
    );
    res.json(rows);
  }),
);

/**
 * Upload a registration certificate. The body is the file itself
 * (PDF, JPEG or PNG, up to 5 MB). Stored in a private bucket through the
 * service role; nobody reaches it except through a short-lived signed URL
 * an admin's review screen asks for.
 */
clinic.post(
  "/documents",
  requireRole("owner"),
  express.raw({ type: [...DOC_TYPES], limit: "5mb" }),
  validate({
    query: z.object({
      kind: z.enum(["facility_registration", "doctor_registration", "other"]),
      name: z.string().trim().min(1).max(200),
    }),
  }),
  asyncRoute(async (req, res) => {
    const { clinicId, userId } = req.auth!;
    const type = (req.header("content-type") ?? "").split(";")[0].trim() as (typeof DOC_TYPES)[number];
    if (!DOC_TYPES.includes(type) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw badRequest("BAD_FILE", "Upload a PDF, JPG or PNG file, up to 5 MB.");
    }
    const { kind, name } = req.query as unknown as { kind: string; name: string };

    const clinicRow = unwrap(
      await dbAdmin.from("clinics").select("verification_status").eq("id", clinicId).single(),
      "clinic",
    );
    if (!["submitted", "under_review", "needs_info"].includes(clinicRow.verification_status)) {
      throw badRequest("NOT_UNDER_REVIEW", "Documents can be added while the application is being reviewed.");
    }

    const path = `${clinicId}/${kind}-${Date.now()}.${EXT[type]}`;
    const up = await dbAdmin.storage.from("clinic-documents").upload(path, req.body, { contentType: type, upsert: false });
    if (up.error) {
      req.log.error({ err: up.error }, "document upload failed");
      throw badRequest("UPLOAD_FAILED", "The file could not be stored. Try again.");
    }
    const row = unwrap(
      await dbAdmin
        .from("clinic_documents")
        .insert({
          clinic_id: clinicId,
          kind,
          storage_path: path,
          file_name: name,
          content_type: type,
          size_bytes: req.body.length,
          uploaded_by: userId,
        })
        .select("id, kind, file_name, content_type, size_bytes, uploaded_at")
        .single(),
      "document",
    );
    res.status(201).json(row);
  }),
);

// --- Support access (break-glass) ---------------------------------------------------------
/**
 * The owner can let SAHVA support see patient details for a few hours, to
 * fix a problem. Owners and managers see the history; only the owner opens
 * or closes it. Every record support opens shows in the patient's access log.
 */
clinic.get(
  "/support-access",
  requireRole("owner", "manager"),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("support_access_grants")
        .select("id, reason, created_at, expires_at, revoked_at, staff_profiles!support_access_grants_granted_by_fkey(full_name)")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(20),
      "support access",
    );
    // Who at SAHVA looked, from the clinic's own access log.
    const since = rows.at(-1)?.created_at ?? new Date().toISOString();
    const looks = await dbAdmin
      .from("record_access_log")
      .select("actor_user_id, accessed_at")
      .eq("clinic_id", clinicId)
      .eq("actor_type", "support")
      .gte("accessed_at", since);
    const now = Date.now();
    res.json(
      rows.map((g) => ({
        id: g.id,
        reason: g.reason,
        created_at: g.created_at,
        expires_at: g.expires_at,
        revoked_at: g.revoked_at,
        granted_by: (g.staff_profiles as { full_name: string } | null)?.full_name ?? null,
        active: !g.revoked_at && new Date(g.expires_at).getTime() > now,
        records_opened: (looks.data ?? []).filter(
          (l) => l.accessed_at >= g.created_at && l.accessed_at <= (g.revoked_at ?? g.expires_at),
        ).length,
      })),
    );
  }),
);

clinic.post(
  "/support-access",
  requireRole("owner"),
  validate({ body: z.object({ hours: z.number().int().min(1).max(72), reason: z.string().trim().min(3).max(500) }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as { hours: number; reason: string };
    const { data, error } = await db.rpc("grant_support_access", { p_clinic: clinicId, p_hours: b.hours, p_reason: b.reason });
    if (error) {
      if (error.code === "23505") throw badRequest("ALREADY_OPEN", "Support access is already open. Close it first.");
      throw fromPostgrest(error, "opening support access");
    }
    res.status(201).json(data);
  }),
);

clinic.post(
  "/support-access/:id/revoke",
  requireRole("owner"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { data, error } = await db.rpc("revoke_support_access", { p_grant: req.params.id });
    if (error) throw fromPostgrest(error, "closing support access");
    res.json(data);
  }),
);
