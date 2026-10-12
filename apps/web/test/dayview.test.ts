import { test } from "node:test";
import assert from "node:assert/strict";
import { hourMarks, layoutDay, minutesInDay } from "../lib/dayview";

const TZ = "Asia/Kolkata";
const DAY = "2026-10-13";
const ist = (hhmm: string, day = DAY) => `${day}T${hhmm}:00+05:30`;
const docs = [{ id: "anitha" }, { id: "ramesh" }];

test("minutesInDay reads the clinic's clock, not the browser's", () => {
  // 04:30 UTC is 10:00 in Warangal.
  assert.equal(minutesInDay("2026-10-13T04:30:00Z", DAY, TZ), 600);
});

test("minutesInDay clamps times on other days to the edges", () => {
  assert.equal(minutesInDay(ist("23:00", "2026-10-12"), DAY, TZ), 0);
  assert.equal(minutesInDay(ist("01:00", "2026-10-14"), DAY, TZ), 1440);
});

test("blocks sit in their doctor's column at the right offset", () => {
  const l = layoutDay({
    appointments: [
      { id: "a", doctor_id: "anitha", starts_at: ist("10:00"), ends_at: ist("10:15"), status: "booked" },
      { id: "b", doctor_id: "ramesh", starts_at: ist("09:30"), ends_at: ist("09:50"), status: "confirmed" },
    ],
    doctors: docs,
    timeOff: [],
    day: DAY,
    tz: TZ,
  });
  assert.equal(l.startMin, 9 * 60);
  assert.deepEqual(l.columns[0].blocks.map((b) => [b.item.id, b.top, b.height]), [["a", 60, 15]]);
  assert.deepEqual(l.columns[1].blocks.map((b) => [b.item.id, b.top, b.height]), [["b", 30, 20]]);
});

test("the range grows to fit an early or late appointment", () => {
  const l = layoutDay({
    appointments: [
      { id: "early", doctor_id: "anitha", starts_at: ist("07:40"), ends_at: ist("07:55"), status: "booked" },
      { id: "late", doctor_id: "anitha", starts_at: ist("20:10"), ends_at: ist("20:30"), status: "booked" },
    ],
    doctors: docs,
    timeOff: [],
    day: DAY,
    tz: TZ,
  });
  assert.equal(l.startMin, 7 * 60);
  assert.equal(l.endMin, 21 * 60);
});

test("cancelled appointments are left out, so they never overlap the replacement", () => {
  const l = layoutDay({
    appointments: [
      { id: "old", doctor_id: "anitha", starts_at: ist("10:00"), ends_at: ist("10:15"), status: "cancelled" },
      { id: "new", doctor_id: "anitha", starts_at: ist("10:00"), ends_at: ist("10:15"), status: "booked" },
    ],
    doctors: docs,
    timeOff: [],
    day: DAY,
    tz: TZ,
  });
  assert.deepEqual(l.columns[0].blocks.map((b) => b.item.id), ["new"]);
});

test("time off is shaded only inside the visible range", () => {
  const l = layoutDay({
    appointments: [],
    doctors: docs,
    timeOff: [{ doctor_id: "anitha", starts_at: ist("08:00"), ends_at: ist("13:00") }],
    day: DAY,
    tz: TZ,
  });
  assert.deepEqual(l.columns[0].off, [{ top: 0, height: 4 * 60 }]);
  assert.deepEqual(l.columns[1].off, []);
});

test("hourMarks labels each hour in 12-hour time", () => {
  assert.deepEqual(hourMarks(11 * 60, 13 * 60), [
    { min: 0, label: "11 am" },
    { min: 60, label: "12 pm" },
    { min: 120, label: "1 pm" },
  ]);
});

test("a zero-length appointment still gets a visible block", () => {
  const l = layoutDay({
    appointments: [{ id: "z", doctor_id: "anitha", starts_at: ist("10:00"), ends_at: ist("10:00"), status: "booked" }],
    doctors: docs,
    timeOff: [],
    day: DAY,
    tz: TZ,
  });
  assert.deepEqual(l.columns[0].blocks.map((b) => [b.item.id, b.top, b.height]), [["z", 60, 15]]);
});
