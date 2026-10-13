import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { paginationQuery, uuid, validate } from "../middleware/validate.js";
import { AppError, unwrap } from "../lib/errors.js";

export const calls = Router();

const listQuery = paginationQuery.extend({
  outcome: z
    .enum([
      "booked",
      "rescheduled",
      "cancelled",
      "faq_answered",
      "escalated",
      "no_action",
      "unresolved",
    ])
    .optional(),
  language: z.enum(["te", "en", "hi"]).optional(),
  recovered: z.coerce.boolean().optional(),
});

calls.get(
  "/",
  validate({ query: listQuery }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const q = req.query as unknown as z.infer<typeof listQuery>;

    let query = db
      .from("calls")
      .select("*, patients(id, full_name), call_summaries(summary_en, summary_te)", {
        count: "exact",
      })
      .eq("clinic_id", clinicId)
      .order("started_at", { ascending: false })
      .range(q.offset, q.offset + q.limit - 1);

    if (q.outcome) query = query.eq("outcome", q.outcome);
    if (q.language) query = query.eq("primary_language", q.language);
    if (q.recovered !== undefined) query = query.eq("recovered_missed", q.recovered);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0, limit: q.limit, offset: q.offset });
  }),
);

/**
 * One call with its full transcript and every tool the model attempted.
 *
 * The transcript is what a patient said about their health, so opening it is
 * logged first (log_call_access, fail closed) — and refused for receptionists
 * when the owner has hidden transcripts from them. Past the clinic's
 * retention the words are gone; the call itself is still shown.
 */
calls.get(
  "/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
    const logged = await db.rpc("log_call_access", { p_call_id: req.params.id, p_request_id: req.id });
    if (logged.error && logged.error.code !== "42501") {
      req.log.error({ err: logged.error }, "transcript access could not be logged; refusing the read");
      throw new AppError(503, "AUDIT_UNAVAILABLE", "This call cannot be opened right now. Please try again.");
    }
    const transcriptStatus = logged.error ? "restricted" : logged.data ? "available" : "purged";
    if (transcriptStatus !== "available") {
      const call = unwrap(await db.from("calls").select("*, patients(id, full_name, phone_e164)").eq("id", req.params.id).single(), "call");
      res.json({ ...call, turns: [], tool_invocations: [], summary: null, transcript_status: transcriptStatus });
      return;
    }
    const [call, turns, tools, summary] = await Promise.all([
      db
        .from("calls")
        .select("*, patients(id, full_name, phone_e164)")
        .eq("id", req.params.id)
        .single(),
      db.from("call_turns").select("*").eq("call_id", req.params.id).order("turn_index"),
      db
        .from("call_tool_invocations")
        .select("*")
        .eq("call_id", req.params.id)
        .order("created_at"),
      db.from("call_summaries").select("*").eq("call_id", req.params.id).maybeSingle(),
    ]);

    res.json({
      ...unwrap(call, "call"),
      turns: turns.data ?? [],
      tool_invocations: tools.data ?? [],
      summary: summary.data,
      transcript_status: transcriptStatus,
    });
  }),
);
