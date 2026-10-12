import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise } from "../lib/patient-summary";

const NOW = new Date("2026-10-12T12:00:00+05:30");
const a = (id: string, day: string, status: string) => ({ id, starts_at: `${day}T10:00:00+05:30`, status });

test("upcoming is soonest first and only live appointments", () => {
  const s = summarise(
    [a("later", "2026-10-20", "booked"), a("soon", "2026-10-13", "confirmed"), a("gone", "2026-10-14", "cancelled")],
    NOW,
  );
  assert.deepEqual(s.upcoming.map((x) => x.id), ["soon", "later"]);
});

test("a cancelled future appointment is history, not upcoming", () => {
  const s = summarise([a("gone", "2026-10-14", "cancelled")], NOW);
  assert.deepEqual(s.upcoming, []);
  assert.deepEqual(s.past.map((x) => x.id), ["gone"]);
});

test("past is most recent first, with counts of how they went", () => {
  const s = summarise(
    [
      a("v1", "2026-09-01", "completed"),
      a("ns", "2026-09-20", "no_show"),
      a("v2", "2026-10-01", "completed"),
      a("c", "2026-08-01", "cancelled"),
    ],
    NOW,
  );
  assert.deepEqual(s.past.map((x) => x.id), ["v2", "ns", "v1", "c"]);
  assert.equal(s.visits, 2);
  assert.equal(s.noShows, 1);
  assert.equal(s.cancelled, 1);
});

test("a patient flagged for reschedule still shows as upcoming", () => {
  // They have not been moved yet; hiding them would lose them.
  assert.equal(summarise([a("flag", "2026-10-13", "needs_reschedule")], NOW).upcoming.length, 1);
});
