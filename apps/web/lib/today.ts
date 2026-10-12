import type { Enums } from "@sahva/types";
import type { IconName } from "@/components/icons";

/**
 * The Command Center's arithmetic, free of React so it can be unit tested.
 *
 * The overview answers four questions in a few seconds: what is happening
 * today, what needs me, is SAHVA working, and are we losing appointments.
 * Everything here feeds one of those.
 */

type Status = Enums<"appointment_status">;
type Source = Enums<"booking_source">;

/** The fields of a today-row these helpers read. */
export type TodayRow = {
  id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: Status | null;
  source: Source | null;
};

export type DayCounts = {
  total: number;
  /** Booked but the patient has not confirmed — the ones worth a call. */
  unconfirmed: number;
  confirmed: number;
  checkedIn: number;
  completed: number;
  noShow: number;
  needsReschedule: number;
};

export function countDay(rows: TodayRow[]): DayCounts {
  const n = (s: Status) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    unconfirmed: n("booked"),
    confirmed: n("confirmed"),
    checkedIn: n("checked_in"),
    completed: n("completed"),
    noShow: n("no_show"),
    needsReschedule: n("needs_reschedule"),
  };
}

/**
 * Where the "now" line sits: the index of the first appointment that has not
 * ended yet. Equal to rows.length when the whole day is over, 0 before it
 * starts. Rows must already be sorted by start time, as the API returns them.
 */
export function nowIndex(rows: TodayRow[], now: Date = new Date()): number {
  const t = now.getTime();
  const i = rows.findIndex((r) => {
    const end = r.ends_at ?? r.starts_at;
    return end !== null && new Date(end).getTime() > t;
  });
  return i === -1 ? rows.length : i;
}

/**
 * How a booking arrived. Labelled with words and an icon, never colour alone —
 * the point is to see at a glance how much of today the AI booked.
 */
export function bookingSource(s: Source | null): { label: string; icon: IconName } {
  switch (s) {
    case "ai_call":
      return { label: "AI call", icon: "sparkles" };
    case "staff_manual":
      return { label: "Staff", icon: "patients" };
    case "walk_in":
      return { label: "Walk-in", icon: "doctor" };
    case "whatsapp":
      return { label: "WhatsApp", icon: "message" };
    case "web":
      return { label: "Online", icon: "language" };
    default:
      return { label: "Unknown", icon: "warning" };
  }
}

const SEVERITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * The few action items worth showing on the overview: most severe first,
 * oldest first within a severity — the one waiting longest is the one a
 * patient is most likely to be hurt by.
 */
export function topActions<T extends { severity: string | null; created_at: string | null }>(
  items: T[],
  limit = 5,
): T[] {
  return [...items]
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity ?? "low"] ?? 9) - (SEVERITY_RANK[b.severity ?? "low"] ?? 9) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    )
    .slice(0, limit);
}
