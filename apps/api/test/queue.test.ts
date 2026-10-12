import { strict as assert } from "node:assert";
import test from "node:test";
import { isCurrent, localDay, patientsAhead } from "../src/lib/queue.js";

const TZ = "Asia/Kolkata";
const ist = (hhmm: string, day = "2026-10-12") => `${day}T${hhmm}:00+05:30`;
const NOW = new Date(ist("11:00"));

test("localDay uses the clinic's calendar, not UTC's", () => {
  // 20:00 UTC on the 12th is 01:30 on the 13th in Warangal.
  assert.equal(localDay("2026-10-12T20:00:00Z", TZ), "2026-10-13");
});

test("a checked-in patient whose slot has passed is still current today", () => {
  assert.equal(isCurrent({ starts_at: ist("10:00"), status: "checked_in" }, NOW, TZ), true);
});

test("yesterday's live appointment is not current, and finished ones never are", () => {
  assert.equal(isCurrent({ starts_at: ist("10:00", "2026-10-11"), status: "booked" }, NOW, TZ), false);
  assert.equal(isCurrent({ starts_at: ist("12:00"), status: "completed" }, NOW, TZ), false);
  assert.equal(isCurrent({ starts_at: ist("12:00"), status: "cancelled" }, NOW, TZ), false);
});

test("patientsAhead counts the same doctor's waiting patients who start earlier", () => {
  const me = { id: "me", doctor_id: "d1", starts_at: ist("11:30"), status: "confirmed" };
  const day = [
    me,
    { id: "a", doctor_id: "d1", starts_at: ist("10:30"), status: "checked_in" },
    { id: "b", doctor_id: "d1", starts_at: ist("11:00"), status: "booked" },
    { id: "done", doctor_id: "d1", starts_at: ist("10:00"), status: "completed" },
    { id: "gone", doctor_id: "d1", starts_at: ist("10:15"), status: "cancelled" },
    { id: "moved", doctor_id: "d1", starts_at: ist("10:45"), status: "needs_reschedule" },
    { id: "other", doctor_id: "d2", starts_at: ist("09:00"), status: "booked" },
    { id: "later", doctor_id: "d1", starts_at: ist("12:00"), status: "booked" },
  ];
  assert.equal(patientsAhead(me, day), 2);
});
