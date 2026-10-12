/**
 * Where a patient stands in today's queue, for the portal.
 *
 * Counts only: the portal must never reveal who else is waiting. And no
 * "now serving" number — nothing records which patient is with the doctor
 * (checked_in means arrived, not called in), so the honest figure is how many
 * live appointments sit ahead of this one.
 */

const LIVE = new Set(["booked", "confirmed", "checked_in", "needs_reschedule"]);
const WAITING = new Set(["booked", "confirmed", "checked_in"]);

/** YYYY-MM-DD of an instant in the clinic's timezone. */
export function localDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

type Row = { id?: string | null; starts_at?: string | null; status?: string | null; doctor_id?: string | null };

/**
 * Still current for the patient: live, and either in the future or today.
 * A checked-in patient whose slot time has passed is still waiting, not past.
 */
export function isCurrent(a: Row, now: Date, tz: string): boolean {
  if (!a.starts_at || !a.status || !LIVE.has(a.status)) return false;
  return new Date(a.starts_at).getTime() >= now.getTime() || localDay(a.starts_at, tz) === localDay(now.toISOString(), tz);
}

/** Live appointments with the same doctor, the same day, starting earlier. */
export function patientsAhead(target: Row, sameDoctorSameDay: Row[]): number {
  if (!target.starts_at) return 0;
  const t = new Date(target.starts_at).getTime();
  return sameDoctorSameDay.filter(
    (a) =>
      a.id !== target.id &&
      a.doctor_id === target.doctor_id &&
      !!a.starts_at &&
      new Date(a.starts_at).getTime() < t &&
      WAITING.has(a.status ?? ""),
  ).length;
}
