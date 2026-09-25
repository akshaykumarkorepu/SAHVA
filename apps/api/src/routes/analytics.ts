import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { unwrap } from "../lib/errors.js";

export const analytics = Router();

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Dashboard headline numbers. Reads the views rather than re-implementing the
 * aggregation here, so the API and any SQL console agree on what "recovered
 * missed call" means.
 */
analytics.get(
  "/summary",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const { days } = req.query as unknown as { days: number };
    const since = daysAgo(days);

    const [daily, actions, costs] = await Promise.all([
      db
        .from("v_call_metrics_daily")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("day", since)
        .order("day"),
      db.from("v_open_action_items").select("id, severity").eq("clinic_id", clinicId),
      db
        .from("v_call_costs")
        .select("cost_inr")
        .eq("clinic_id", clinicId)
        .gte("started_at", `${since}T00:00:00Z`),
    ]);

    const rows = daily.data ?? [];
    const sum = (k: keyof (typeof rows)[number]) =>
      rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);

    const totalCalls = sum("total_calls");
    const bookings = sum("bookings");
    const openActions = actions.data ?? [];
    const costInr = (costs.data ?? []).reduce((t, r) => t + Number(r.cost_inr ?? 0), 0);

    res.json({
      window_days: days,
      totals: {
        calls: totalCalls,
        answered: sum("answered"),
        bookings,
        reschedules: sum("reschedules"),
        recovered_missed: sum("recovered_missed"),
        escalations: sum("escalations"),
        telugu_calls: sum("telugu_calls"),
        english_calls: sum("english_calls"),
        // Guard the divide — a brand-new clinic has zero calls on day one.
        conversion_rate: totalCalls > 0 ? Math.round((bookings / totalCalls) * 100) : 0,
      },
      open_action_items: {
        total: openActions.length,
        urgent: openActions.filter((a) => a.severity === "urgent").length,
        high: openActions.filter((a) => a.severity === "high").length,
      },
      cost: {
        total_inr: Number(costInr.toFixed(2)),
        per_call_inr: totalCalls > 0 ? Number((costInr / totalCalls).toFixed(3)) : 0,
      },
      daily: rows,
    });
  }),
);

/** Real measured cost per call — the input to any pricing decision. */
analytics.get(
  "/costs",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const { days } = req.query as unknown as { days: number };
    const rows = unwrap(
      await db
        .from("v_call_costs")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("started_at", `${daysAgo(days)}T00:00:00Z`)
        .order("started_at", { ascending: false }),
      "call costs",
    );
    res.json(rows);
  }),
);

analytics.get(
  "/utilisation",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("v_doctor_utilisation")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("day", daysAgo(30))
        .order("day", { ascending: false }),
      "utilisation",
    );
    res.json(rows);
  }),
);
