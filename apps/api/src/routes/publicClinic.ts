import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { isoDate, uuid, validate } from "../middleware/validate.js";
import { publicRequestLimiter } from "../middleware/rateLimit.js";
import { AppError, badRequest, fromPostgrest, notFound, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { clinicProfile } from "../lib/clinicProfile.js";

/**
 * A clinic's public page (/c/<slug>): no sign-in. Read its doctors and
 * timings, see free slots, and request one. A request holds the slot but is
 * unverified until the clinic calls back (request_public_booking); SMS codes
 * will replace the call-back once a provider is set up.
 */
export const publicClinic = Router();

/** Requests: at least 2 hours ahead (time to call back), at most 14 days. */
export const PUBLIC_MIN_NOTICE_MIN = 120;
export const PUBLIC_HORIZON_DAYS = 14;

async function bySlug(slug: string) {
  const { data, error } = await dbAdmin.rpc("public_clinic_by_slug", { p_slug: slug });
  if (error) throw fromPostgrest(error, "finding the clinic");
  const row = (data ?? [])[0];
  // A clinic under review, suspended or lapsed has no public page at all.
  if (!row || !row.live) throw notFound("clinic");
  return row as { id: string; live: boolean; requests_enabled: boolean };
}

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/) });

publicClinic.get(
  "/clinics/:slug",
  validate({ params: slugParam }),
  asyncRoute(async (req, res) => {
    const c = await bySlug(req.params.slug);
    const profile = await clinicProfile(c.id);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      ...profile,
      booking: { enabled: c.requests_enabled, horizon_days: PUBLIC_HORIZON_DAYS, min_notice_minutes: PUBLIC_MIN_NOTICE_MIN },
    });
  }),
);

async function activeDoctor(clinicId: string, doctorId: string) {
  const { data } = await dbAdmin.from("doctors").select("id").eq("id", doctorId).eq("clinic_id", clinicId).eq("is_active", true).maybeSingle();
  if (!data) throw badRequest("UNKNOWN_DOCTOR", "That doctor is not at this clinic.");
}

publicClinic.get(
  "/clinics/:slug/slots",
  validate({ params: slugParam, query: z.object({ doctor_id: uuid, date: isoDate }) }),
  asyncRoute(async (req, res) => {
    const c = await bySlug(req.params.slug);
    if (!c.requests_enabled) throw new AppError(403, "REQUESTS_OFF", "Please call the clinic to book.");
    const q = req.query as unknown as { doctor_id: string; date: string };
    await activeDoctor(c.id, q.doctor_id);
    const slots = unwrap(await dbAdmin.rpc("get_available_slots", { p_doctor_id: q.doctor_id, p_date: q.date }), "availability");
    const earliest = Date.now() + PUBLIC_MIN_NOTICE_MIN * 60_000;
    const latest = Date.now() + PUBLIC_HORIZON_DAYS * 86_400_000;
    res.json(
      (slots ?? []).filter((s: { slot_start: string; remaining: number }) => {
        const t = new Date(s.slot_start).getTime();
        return s.remaining > 0 && t >= earliest && t <= latest;
      }),
    );
  }),
);

/** "98765 43210", "+91 98765-43210", "098765 43210" → "+919876543210"; anything else → null. */
export function indianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

publicClinic.post(
  "/clinics/:slug/requests",
  publicRequestLimiter(),
  validate({
    params: slugParam,
    body: z.object({
      doctor_id: uuid,
      starts_at: z.string().datetime({ offset: true }),
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().min(10).max(20),
      reason: z.string().trim().max(200).optional(),
      // Honeypot: a field people never see. Bots fill it.
      website: z.string().max(0).optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const c = await bySlug(req.params.slug);
    if (!c.requests_enabled) throw new AppError(403, "REQUESTS_OFF", "Please call the clinic to book.");
    const b = req.body as { doctor_id: string; starts_at: string; name: string; phone: string; reason?: string };
    const phone = indianMobile(b.phone);
    if (!phone) throw badRequest("BAD_PHONE", "Enter a 10-digit Indian mobile number.");
    await activeDoctor(c.id, b.doctor_id);

    const { data, error } = await dbAdmin.rpc("request_public_booking", {
      p_clinic_id: c.id,
      p_doctor_id: b.doctor_id,
      p_name: b.name,
      p_phone: phone,
      p_starts_at: b.starts_at,
      p_reason: (b.reason ?? null) as never,
    });
    if (error) {
      if (error.code === "23505") throw new AppError(409, "REQUEST_PENDING", "There is already a request waiting for this number. The clinic will call you.");
      throw fromPostgrest(error, "requesting the appointment");
    }
    req.log.info({ clinicId: c.id, appointmentId: data.id }, "public booking request");
    // Only what the person needs: never whether this number was already a patient.
    res.status(201).json({ starts_at: data.starts_at, phone });
  }),
);
