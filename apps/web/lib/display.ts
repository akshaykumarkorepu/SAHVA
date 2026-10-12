/**
 * What the waiting-room screen shows for each doctor.
 *
 * Tokens only — the screen faces the public, so no names, ever. And "next",
 * not "now serving": nothing records which patient is in the consulting room,
 * so the honest statement is who among those who have arrived is next in line.
 */

type Row = {
  doctor_id: string | null;
  doctor_name: string | null;
  colour_hex: string | null;
  status: string | null;
  token_number: number | null;
};

export type DoctorQueue = {
  doctorId: string;
  doctorName: string;
  colour: string | null;
  /** Lowest token among patients who have checked in and not been seen. */
  next: number | null;
  /** The rest of the checked-in tokens, in order. */
  waiting: number[];
  /** Seen today — a sense of progress for people who have been waiting. */
  seen: number;
};

export function queues(rows: Row[]): DoctorQueue[] {
  const by = new Map<string, DoctorQueue & { arrived: number[] }>();
  for (const r of rows) {
    if (!r.doctor_id) continue;
    const q =
      by.get(r.doctor_id) ??
      ({ doctorId: r.doctor_id, doctorName: r.doctor_name ?? "", colour: r.colour_hex, next: null, waiting: [], seen: 0, arrived: [] } as DoctorQueue & { arrived: number[] });
    if (r.status === "checked_in" && r.token_number != null) q.arrived.push(r.token_number);
    if (r.status === "completed") q.seen += 1;
    by.set(r.doctor_id, q);
  }
  return [...by.values()]
    .map(({ arrived, ...q }) => {
      const sorted = [...arrived].sort((a, b) => a - b);
      return { ...q, next: sorted[0] ?? null, waiting: sorted.slice(1) };
    })
    .sort((a, b) => a.doctorName.localeCompare(b.doctorName));
}

/** Doctors whose "next" token changed since the last snapshot — they get the chime. */
export function changedNext(before: DoctorQueue[], after: DoctorQueue[]): string[] {
  const prev = new Map(before.map((q) => [q.doctorId, q.next]));
  return after.filter((q) => q.next !== null && prev.has(q.doctorId) && prev.get(q.doctorId) !== q.next).map((q) => q.doctorId);
}
