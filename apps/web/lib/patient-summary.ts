/**
 * What a receptionist needs to know about a patient at a glance: what is
 * coming up, what happened before, and whether they tend to turn up.
 */

export type ApptLike = { id: string; starts_at: string; status: string };

export type PatientSummary<T extends ApptLike> = {
  /** Soonest first. Live appointments only — a cancelled one is not coming up. */
  upcoming: T[];
  /** Most recent first. */
  past: T[];
  visits: number;
  noShows: number;
  cancelled: number;
};

const LIVE = new Set(["booked", "confirmed", "checked_in", "needs_reschedule"]);

export function summarise<T extends ApptLike>(appts: T[], now: Date = new Date()): PatientSummary<T> {
  const t = now.getTime();
  const at = (a: T) => new Date(a.starts_at).getTime();
  return {
    upcoming: appts.filter((a) => LIVE.has(a.status) && at(a) >= t).sort((a, b) => at(a) - at(b)),
    past: appts.filter((a) => at(a) < t || !LIVE.has(a.status)).sort((a, b) => at(b) - at(a)),
    visits: appts.filter((a) => a.status === "completed").length,
    noShows: appts.filter((a) => a.status === "no_show").length,
    cancelled: appts.filter((a) => a.status === "cancelled").length,
  };
}
