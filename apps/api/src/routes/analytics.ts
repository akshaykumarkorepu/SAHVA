import { Router } from "express";
import { db } from "../db/client.js";

export const analytics = Router();

analytics.get("/summary", (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const callsToday = (
    db.prepare("SELECT COUNT(*) as n FROM calls WHERE started_at >= ?").get(todayIso) as { n: number }
  ).n;

  const callsAnswered = (
    db
      .prepare("SELECT COUNT(*) as n FROM calls WHERE started_at >= ? AND outcome IS NOT NULL")
      .get(todayIso) as { n: number }
  ).n;

  const bookingsMade = (
    db
      .prepare(
        "SELECT COUNT(*) as n FROM calls WHERE started_at >= ? AND outcome IN ('booked','rescheduled')"
      )
      .get(todayIso) as { n: number }
  ).n;

  const cancellations = (
    db
      .prepare("SELECT COUNT(*) as n FROM calls WHERE started_at >= ? AND outcome = 'cancelled'")
      .get(todayIso) as { n: number }
  ).n;

  // Missed-call recovery = (calls flagged was_missed_before_ai AND answered) / (calls flagged was_missed_before_ai)
  const flagged = (
    db.prepare("SELECT COUNT(*) as n FROM calls WHERE was_missed_before_ai = 1").get() as {
      n: number;
    }
  ).n;
  const recovered = (
    db
      .prepare(
        "SELECT COUNT(*) as n FROM calls WHERE was_missed_before_ai = 1 AND outcome IN ('booked','rescheduled')"
      )
      .get() as { n: number }
  ).n;
  const missedCallRecoveryRate = flagged ? Math.round((recovered / flagged) * 100) : 0;

  // Week-by-day call counts (last 7 days, including today)
  const weekCalls: { day: string; calls: number; bookings: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const start = d.toISOString();
    const end = new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const calls = (
      db
        .prepare("SELECT COUNT(*) as n FROM calls WHERE started_at >= ? AND started_at < ?")
        .get(start, end) as { n: number }
    ).n;
    const bookings = (
      db
        .prepare(
          "SELECT COUNT(*) as n FROM calls WHERE started_at >= ? AND started_at < ? AND outcome IN ('booked','rescheduled')"
        )
        .get(start, end) as { n: number }
    ).n;
    weekCalls.push({
      day: d.toISOString().slice(5, 10), // MM-DD
      calls,
      bookings,
    });
  }

  const languageSplit = (
    db
      .prepare("SELECT language, COUNT(*) as n FROM calls GROUP BY language")
      .all() as { language: string | null; n: number }[]
  ).reduce(
    (acc, r) => {
      const k = (r.language || "unknown") as "en" | "te" | "mixed" | "unknown";
      acc[k] = r.n;
      return acc;
    },
    { en: 0, te: 0, mixed: 0, unknown: 0 } as Record<string, number>
  );

  res.json({
    callsToday,
    callsAnswered,
    bookingsMade,
    cancellations,
    missedCallRecoveryRate,
    flagged,
    recovered,
    weekCalls,
    languageSplit,
  });
});
