/**
 * Lays out one day of the diary as a column per doctor, in minutes from the
 * top of the visible range. Pure, so the arithmetic is tested without a DOM.
 *
 * Times are placed in the clinic's timezone, not the browser's: a receptionist
 * whose laptop is set to UTC must still see the 10:00 patient at 10:00.
 */

export type DayAppt = {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type DayOff = { doctor_id: string; starts_at: string; ends_at: string };

export type Block<T> = { top: number; height: number; item: T };

export type DayLayout<T extends DayAppt, D extends { id: string }> = {
  /** Visible range, minutes after midnight in the clinic's timezone. */
  startMin: number;
  endMin: number;
  columns: { doctor: D; blocks: Block<T>[]; off: { top: number; height: number }[] }[];
};

const DEFAULT_START = 9 * 60;
const DEFAULT_END = 19 * 60;

/** Minutes after local midnight in `tz`, clamped to the given day. */
export function minutesInDay(iso: string, day: string, tz: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const localDay = `${get("year")}-${get("month")}-${get("day")}`;
  if (localDay < day) return 0;
  if (localDay > day) return 24 * 60;
  return Number(get("hour")) * 60 + Number(get("minute"));
}

export function layoutDay<T extends DayAppt, D extends { id: string }>({
  appointments,
  doctors,
  timeOff,
  day,
  tz,
}: {
  appointments: T[];
  doctors: D[];
  timeOff: DayOff[];
  day: string;
  tz: string;
}): DayLayout<T, D> {
  // Cancelled appointments free their slot and would overlap whoever took it.
  const live = appointments.filter((a) => a.status !== "cancelled");

  let startMin = DEFAULT_START;
  let endMin = DEFAULT_END;
  for (const a of live) {
    startMin = Math.min(startMin, Math.floor(minutesInDay(a.starts_at, day, tz) / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(minutesInDay(a.ends_at, day, tz) / 60) * 60);
  }

  const clip = (from: number, to: number) => {
    const top = Math.max(from, startMin) - startMin;
    const bottom = Math.min(to, endMin) - startMin;
    return bottom > top ? { top, height: bottom - top } : null;
  };

  const columns = doctors.map((doctor) => ({
    doctor,
    blocks: live
      .filter((a) => a.doctor_id === doctor.id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .flatMap((item) => {
        const from = minutesInDay(item.starts_at, day, tz);
        // A zero-length appointment still needs to be visible and clickable,
        // so give it a minimum before clipping, not after — clip() drops
        // anything with no height.
        const c = clip(from, Math.max(minutesInDay(item.ends_at, day, tz), from + 15));
        return c ? [{ ...c, item }] : [];
      }),
    off: timeOff
      .filter((t) => t.doctor_id === doctor.id)
      .flatMap((t) => {
        const c = clip(minutesInDay(t.starts_at, day, tz), minutesInDay(t.ends_at, day, tz));
        return c ? [c] : [];
      }),
  }));

  return { startMin, endMin, columns };
}

/** "09:00" style hour labels for the range. */
export function hourMarks(startMin: number, endMin: number): { min: number; label: string }[] {
  const out = [];
  for (let m = startMin; m <= endMin; m += 60) {
    const h = Math.floor(m / 60);
    const label = `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
    out.push({ min: m - startMin, label });
  }
  return out;
}
