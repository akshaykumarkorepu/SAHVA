import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { dbAdmin } from "../lib/supabase.js";
import { generatePortalToken } from "../lib/portalToken.js";
import { env } from "../config/env.js";
import { badRequest } from "../lib/errors.js";
import { paginationQuery, phoneE164, uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

export const patients = Router();

patients.get(
  "/",
  validate({ query: paginationQuery.extend({ q: z.string().trim().max(100).optional() }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const { q, limit, offset } = req.query as unknown as {
      q?: string;
      limit: number;
      offset: number;
    };

    let query = db
      .from("patients")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      // PostgREST `or` is comma-delimited; strip the delimiters rather than
      // let a malformed filter reach the database.
      const safe = q.replace(/[,()]/g, " ").trim();
      if (safe) query = query.or(`full_name.ilike.%${safe}%,phone_e164.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0, limit, offset });
  }),
);

patients.get(
  "/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const [patient, appts] = await Promise.all([
      db.from("patients").select("*").eq("id", req.params.id).single(),
      db
        .from("appointments")
        .select("*, doctors(spoken_name, specialty)")
        .eq("patient_id", req.params.id)
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);
    res.json({ ...unwrap(patient, "patient"), appointments: appts.data ?? [] });
  }),
);

/**
 * Everyone registered on a phone number. One handset commonly covers a family,
 * so caller identification needs all of them, not the first match.
 */
patients.get(
  "/by-phone/:phone",
  validate({ params: z.object({ phone: phoneE164 }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("patients")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("phone_e164", req.params.phone)
        .order("created_at"),
      "patients",
    );
    res.json(rows);
  }),
);


// --- Patient portal links ---------------------------------------------------

/**
 * Issue a portal link for a patient.
 *
 * The raw token is returned **once** and never stored — only its hash lives in
 * the database. If staff lose the link they issue a new one; there is no way
 * to recover the old one, which is the point.
 */
patients.post(
  "/:id/portal-link",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ label: z.string().trim().max(80).optional() }).default({}),
  }),
  asyncRoute(async (req, res) => {
    const { db, clinicId, userId } = req.auth!;

    // Read through the caller's own RLS-scoped client, so a patient from
    // another clinic simply does not exist here.
    const patient = unwrap(
      await db.from("patients").select("id, full_name, phone_e164").eq("id", req.params.id).single(),
      "patient",
    );

    const settings = await db
      .from("clinic_settings")
      .select("portal_enabled, portal_link_ttl_days")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (settings.data?.portal_enabled === false) {
      throw badRequest("PORTAL_DISABLED", "The patient portal is turned off for this clinic.");
    }

    const ttlDays = settings.data?.portal_link_ttl_days ?? 30;
    const { raw, hash } = generatePortalToken();
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

    // service_role: the hash must be written even though `patient_access_tokens`
    // has no insert policy for staff — the raw token must not round-trip the browser.
    const token = unwrap(
      await dbAdmin
        .from("patient_access_tokens")
        .insert({
          clinic_id: clinicId,
          patient_id: patient.id,
          token_hash: hash,
          label: (req.body as { label?: string }).label ?? null,
          issued_by: userId,
          issued_via: "whatsapp",
          expires_at: expiresAt,
        })
        .select("id, expires_at")
        .single(),
      "portal link",
    );

    req.log.info({ patientId: patient.id, tokenId: token.id }, "portal link issued");

    res.status(201).json({
      token_id: token.id,
      expires_at: token.expires_at,
      // Shown once. Staff copy it into WhatsApp, or a worker sends it.
      url: `${env.CORS_ORIGINS[0]}/p/${raw}`,
      patient: { id: patient.id, full_name: patient.full_name, phone_e164: patient.phone_e164 },
    });
  }),
);

/** Live links for a patient, so staff can see and revoke what is out there. */
patients.get(
  "/:id/portal-link",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const rows = unwrap(
      await db
        .from("patient_access_tokens")
        .select("id, label, issued_via, expires_at, last_used_at, use_count, revoked_at, created_at")
        .eq("patient_id", req.params.id)
        .order("created_at", { ascending: false }),
      "portal links",
    );
    res.json(rows);
  }),
);

patients.delete(
  "/portal-link/:tokenId",
  validate({ params: z.object({ tokenId: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db
        .from("patient_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", req.params.tokenId)
        .select()
        .single(),
      "portal link",
    );
    req.log.warn({ tokenId: row.id }, "portal link revoked");
    res.json(row);
  }),
);
