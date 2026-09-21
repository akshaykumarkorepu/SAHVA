/**
 * Clinic hours + slot generation.
 * 09:00 – 17:00 local, lunch break 13:00 – 14:00, 15-minute slots.
 */

export const SLOT_MINUTES = 15;
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 17;
export const LUNCH_START_HOUR = 13;
export const LUNCH_END_HOUR = 14;

export type Slot = { startsAt: string; label: string };

export function daySlots(dateIso: string, taken: string[] = []): Slot[] {
  // dateIso: YYYY-MM-DD in clinic local time
  const takenSet = new Set(taken.map((s) => s.slice(0, 16))); // minute precision
  const out: Slot[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    if (h >= LUNCH_START_HOUR && h < LUNCH_END_HOUR) continue;
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const d = new Date(`${dateIso}T${pad(h)}:${pad(m)}:00`);
      const iso = d.toISOString();
      if (takenSet.has(iso.slice(0, 16))) continue;
      out.push({ startsAt: iso, label: `${pad(h)}:${pad(m)}` });
    }
  }
  return out;
}

export function isWithinClinicHours(iso: string): boolean {
  const d = new Date(iso);
  const h = d.getHours();
  return h >= OPEN_HOUR && h < CLOSE_HOUR && !(h >= LUNCH_START_HOUR && h < LUNCH_END_HOUR);
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
