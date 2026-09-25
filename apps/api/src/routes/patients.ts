import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
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
