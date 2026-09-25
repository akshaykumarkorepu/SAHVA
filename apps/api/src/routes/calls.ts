import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { paginationQuery, uuid, validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

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

/** One call with its full transcript and every tool the model attempted. */
calls.get(
  "/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db } = req.auth!;
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
    });
  }),
);
