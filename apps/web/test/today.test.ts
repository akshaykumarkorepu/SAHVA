import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingSource, countDay, nowIndex, topActions, type TodayRow } from "../lib/today";

const at = (hhmm: string) => `2026-10-12T${hhmm}:00+05:30`;

function row(start: string, end: string, extra: Partial<TodayRow> = {}): TodayRow {
  return { id: start, starts_at: at(start), ends_at: at(end), status: "booked", source: "ai_call", ...extra };
}

const DAY = [row("09:00", "09:15"), row("10:00", "10:15"), row("11:00", "11:15")];

test("nowIndex: before the day starts, the line sits above everything", () => {
  assert.equal(nowIndex(DAY, new Date(at("08:00"))), 0);
});

test("nowIndex: an appointment in progress is still upcoming, not past", () => {
  // 10:05 is inside the 10:00 slot — the patient is with the doctor now.
  assert.equal(nowIndex(DAY, new Date(at("10:05"))), 1);
});

test("nowIndex: between appointments", () => {
  assert.equal(nowIndex(DAY, new Date(at("10:30"))), 2);
});

test("nowIndex: after the last one, the line sits below everything", () => {
  assert.equal(nowIndex(DAY, new Date(at("18:00"))), 3);
});

test("nowIndex: falls back to the start when the end is missing", () => {
  assert.equal(nowIndex([row("09:00", "09:15", { ends_at: null })], new Date(at("08:59"))), 0);
  assert.equal(nowIndex([row("09:00", "09:15", { ends_at: null })], new Date(at("09:01"))), 1);
});

test("countDay: unconfirmed means booked and not yet acknowledged", () => {
  const c = countDay([
    row("09:00", "09:15", { status: "booked" }),
    row("09:15", "09:30", { status: "booked" }),
    row("09:30", "09:45", { status: "confirmed" }),
    row("09:45", "10:00", { status: "checked_in" }),
    row("10:00", "10:15", { status: "needs_reschedule" }),
  ]);
  assert.deepEqual(c, {
    total: 5,
    unconfirmed: 2,
    confirmed: 1,
    checkedIn: 1,
    completed: 0,
    noShow: 0,
    needsReschedule: 1,
  });
});

test("bookingSource: every source has words, not just a colour", () => {
  for (const s of ["ai_call", "staff_manual", "walk_in", "whatsapp", "web", null] as const) {
    assert.ok(bookingSource(s).label.length > 0);
  }
  assert.equal(bookingSource("ai_call").label, "AI call");
});

test("topActions: most severe first, then the one waiting longest", () => {
  const items = [
    { id: "a", severity: "normal", created_at: "2026-10-12T08:00:00Z" },
    { id: "b", severity: "urgent", created_at: "2026-10-12T09:00:00Z" },
    { id: "c", severity: "high", created_at: "2026-10-12T07:00:00Z" },
    { id: "d", severity: "urgent", created_at: "2026-10-12T06:00:00Z" },
    { id: "e", severity: "low", created_at: "2026-10-12T05:00:00Z" },
  ];
  assert.deepEqual(topActions(items).map((i) => i.id), ["d", "b", "c", "a", "e"]);
  assert.deepEqual(topActions(items, 2).map((i) => i.id), ["d", "b"]);
});

test("topActions: does not reorder the caller's array", () => {
  const items = [
    { severity: "low", created_at: "1" },
    { severity: "urgent", created_at: "2" },
  ];
  topActions(items);
  assert.equal(items[0].severity, "low");
});
