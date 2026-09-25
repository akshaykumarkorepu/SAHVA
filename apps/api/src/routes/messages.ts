import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { paginationQuery, uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { renderTemplate } from "../lib/templates.js";
import type { TablesUpdate } from "@sahva/types";

export const messages = Router();

/**
 * Outbound messaging.
 *
 * Nothing here talks to WhatsApp yet — that needs a Meta Cloud API account and
 * pre-approved templates. What exists is the honest half: messages are rendered
 * from the clinic's own templates and queued in `messages` with status
 * 'queued'. A worker will pick them up and a delivery webhook will move them to
 * sent/delivered/failed. A failed delivery already raises an action item.
 */

const listQuery = paginationQuery.extend({
  status: z
    .enum(["queued", "sending", "sent", "delivered", "read", "failed", "undelivered"])
    .optional(),
  appointment_id: uuid.optional(),
});

messages.get(
  "/",
  validate({ query: listQuery }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const q = req.query as unknown as z.infer<typeof listQuery>;

    let query = db
      .from("messages")
      .select("*, patients(full_name)", { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(q.offset, q.offset + q.limit - 1);

    if (q.status) query = query.eq("status", q.status);
    if (q.appointment_id) query = query.eq("appointment_id", q.appointment_id);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0, limit: q.limit, offset: q.offset });
  }),
);

/**
 * Render an appointment confirmation without sending it.
 *
 * Used by the dashboard to show staff exactly what a patient will receive, in
 * the patient's own language, before anything leaves the building.
 */
messages.get(
  "/preview/:appointmentId",
  validate({ params: z.object({ appointmentId: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const appt = unwrap(
      await db
        .from("appointments")
        .select(
          "*, doctors(spoken_name), patients(full_name, phone_e164, preferred_language), clinics(name, phone_e164, timezone)",
        )
        .eq("id", req.params.appointmentId)
        .single(),
      "appointment",
    );
    const rendered = await renderTemplate("appointment_confirmed", appt);
    res.json(rendered);
  }),
);

const queueBody = z.object({
  appointment_id: uuid,
  template_key: z.enum(["appointment_confirmed", "appointment_reminder", "reschedule_needed"]),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
});

messages.post(
  "/queue",
  validate({ body: queueBody }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const b = req.body as z.infer<typeof queueBody>;

    const appt = unwrap(
      await db
        .from("appointments")
        .select(
          "*, doctors(spoken_name), patients(id, full_name, phone_e164, preferred_language), clinics(name, phone_e164, timezone)",
        )
        .eq("id", b.appointment_id)
        .single(),
      "appointment",
    );

    const rendered = await renderTemplate(b.template_key, appt);

    const row = unwrap(
      await db
        .from("messages")
        .insert({
          clinic_id: clinicId,
          patient_id: appt.patients?.id ?? null,
          appointment_id: appt.id,
          channel: b.channel,
          direction: "outbound",
          to_e164: rendered.to,
          template_key: b.template_key,
          language: rendered.language,
          body_rendered: rendered.body,
          status: "queued",
        })
        .select()
        .single(),
      "message",
    );

    req.log.info({ messageId: row.id, template: b.template_key }, "message queued");
    res.status(201).json(row);
  }),
);

/**
 * Delivery-receipt webhook (mounted behind requireServiceKey).
 *
 * Idempotent on `provider_message_id`. Moving a row to 'failed' fires
 * `messages_flag_failed`, which raises an action item — a patient who does not
 * know about their appointment is a human problem, not a log line.
 */
messages.post(
  "/delivery",
  validate({
    body: z.object({
      provider_message_id: z.string().min(1).max(200),
      status: z.enum(["sent", "delivered", "read", "failed", "undelivered"]),
      error_code: z.string().max(60).optional(),
      error_detail: z.string().max(1000).optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const b = req.body as {
      provider_message_id: string;
      status: "sent" | "delivered" | "read" | "failed" | "undelivered";
      error_code?: string;
      error_detail?: string;
    };
    const now = new Date().toISOString();

    const patch: TablesUpdate<"messages"> = { status: b.status };
    if (b.status === "sent") patch.sent_at = now;
    if (b.status === "delivered") patch.delivered_at = now;
    if (b.status === "read") patch.read_at = now;
    if (b.status === "failed") {
      patch.failed_at = now;
      // The schema requires an error_code whenever status is 'failed'.
      patch.error_code = b.error_code ?? "UNKNOWN";
      patch.error_detail = b.error_detail ?? null;
    }

    const { data, error } = await dbAdmin
      .from("messages")
      .update(patch)
      .eq("provider_message_id", b.provider_message_id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    // Never 4xx a carrier for an unknown id — it will retry forever.
    if (!data) {
      req.log.warn({ providerMessageId: b.provider_message_id }, "delivery receipt for unknown message");
    }
    res.json({ ok: true });
  }),
);
