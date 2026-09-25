import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";
import { badRequest } from "../lib/errors.js";

export const actions = Router();

/**
 * The Action Required queue — the product's differentiator.
 *
 * Nothing here dispatches a message on its own. A reschedule batch is created
 * in DRAFT by a database trigger and only leaves draft when a named human
 * presses send, which a CHECK constraint enforces regardless of this code.
 */

actions.get(
  "/",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("v_open_action_items")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("severity", { ascending: false })
        .order("created_at"),
      "action items",
    );
    res.json(rows);
  }),
);

actions.get(
  "/batches/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const [batch, items] = await Promise.all([
      db
        .from("reschedule_batches")
        .select("*, doctors(spoken_name, specialty)")
        .eq("id", req.params.id)
        .single(),
      db
        .from("reschedule_batch_items")
        .select(
          "*, patients(id, full_name, phone_e164, preferred_language), appointments!reschedule_batch_items_appointment_id_fkey(id, starts_at, status)",
        )
        .eq("batch_id", req.params.id)
        .order("created_at"),
    ]);
    res.json({ ...unwrap(batch, "reschedule batch"), items: items.data ?? [] });
  }),
);

/**
 * Dispatch a reschedule batch.
 *
 * Deliberately requires an explicit, attributed action. `dispatched_by` is
 * stamped from the session — it cannot be supplied by the client — and the
 * `reschedule_batches_human_dispatch` CHECK constraint rejects the transition
 * if it is missing.
 */
actions.post(
  "/batches/:id/dispatch",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db, userId } = req.auth!;

    const batch = unwrap(
      await db.from("reschedule_batches").select("*").eq("id", req.params.id).single(),
      "reschedule batch",
    );
    if (batch.status !== "draft") {
      throw badRequest("BATCH_NOT_DRAFT", `Batch is already ${batch.status}.`);
    }

    const updated = unwrap(
      await db
        .from("reschedule_batches")
        .update({
          status: "notifying",
          dispatched_by: userId,
          dispatched_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select()
        .single(),
      "reschedule batch",
    );

    // Messages are queued by the worker, not sent inline: a slow WhatsApp API
    // must never block a staff member's click.
    req.log.warn(
      { batchId: updated.id, affected: updated.total_affected, dispatchedBy: userId },
      "reschedule batch dispatched by staff",
    );

    res.json(updated);
  }),
);

actions.post(
  "/:id/resolve",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      status: z.enum(["resolved", "dismissed"]).default("resolved"),
      note: z.string().max(1000).optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const { db, userId } = req.auth!;
    const b = req.body as { status: "resolved" | "dismissed"; note?: string };
    const row = unwrap(
      await db
        .from("action_items")
        .update({
          status: b.status,
          resolved_by: userId,
          resolved_at: new Date().toISOString(),
          resolution_note: b.note ?? null,
        })
        .eq("id", req.params.id)
        .select()
        .single(),
      "action item",
    );
    res.json(row);
  }),
);

actions.post(
  "/:id/assign",
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ assigned_to: uuid.nullable() }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const row = unwrap(
      await db
        .from("action_items")
        .update({
          assigned_to: (req.body as { assigned_to: string | null }).assigned_to,
          status: "in_progress",
        })
        .eq("id", req.params.id)
        .select()
        .single(),
      "action item",
    );
    res.json(row);
  }),
);
