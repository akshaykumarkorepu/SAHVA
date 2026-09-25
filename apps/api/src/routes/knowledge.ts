import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

export const knowledge = Router();

/**
 * The clinic's knowledge base — everything the AI is allowed to say that is not
 * a schedule fact.
 *
 * On `main` this lived in a hardcoded system prompt. Now it is per-clinic data
 * that an owner edits, which is the only way a second clinic can ever be
 * onboarded without a developer.
 */

// --- FAQs ------------------------------------------------------------------

const faqBody = z.object({
  question_en: z.string().trim().min(3).max(300),
  question_te: z.string().trim().max(300).optional(),
  answer_en: z.string().trim().min(3).max(2000),
  answer_te: z.string().trim().max(2000).optional(),
  category: z
    .enum(["fees", "timings", "location", "services", "doctors", "insurance", "preparation", "other"])
    .default("other"),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  priority: z.number().int().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

knowledge.get(
  "/faqs",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("clinic_faqs")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("priority", { ascending: false })
        .order("created_at"),
      "FAQs",
    );
    res.json(rows);
  }),
);

knowledge.post(
  "/faqs",
  requireRole("owner", "manager"),
  validate({ body: faqBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const row = unwrap(
      await db
        .from("clinic_faqs")
        .insert({ ...(req.body as z.infer<typeof faqBody>), clinic_id: clinicId })
        .select()
        .single(),
      "FAQ",
    );
    res.status(201).json(row);
  }),
);

knowledge.patch(
  "/faqs/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }), body: faqBody.partial() }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db.from("clinic_faqs").update(req.body).eq("id", req.params.id).select().single(),
      "FAQ",
    );
    res.json(row);
  }),
);

knowledge.delete(
  "/faqs/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("clinic_faqs").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  }),
);

// --- Services --------------------------------------------------------------

const serviceBody = z.object({
  name_en: z.string().trim().min(2).max(120),
  name_te: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  price_paise: z.number().int().min(0).max(100_000_00).optional(),
  duration_min: z.number().int().min(5).max(240).optional(),
  category: z.string().trim().max(60).optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0),
});

knowledge.get(
  "/services",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("clinic_services")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("sort_order")
        .order("name_en"),
      "services",
    );
    res.json(rows);
  }),
);

knowledge.post(
  "/services",
  requireRole("owner", "manager"),
  validate({ body: serviceBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const row = unwrap(
      await db
        .from("clinic_services")
        .insert({ ...(req.body as z.infer<typeof serviceBody>), clinic_id: clinicId })
        .select()
        .single(),
      "service",
    );
    res.status(201).json(row);
  }),
);

knowledge.patch(
  "/services/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }), body: serviceBody.partial() }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db.from("clinic_services").update(req.body).eq("id", req.params.id).select().single(),
      "service",
    );
    res.json(row);
  }),
);

knowledge.delete(
  "/services/:id",
  requireRole("owner", "manager"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const { error } = await db.from("clinic_services").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  }),
);
