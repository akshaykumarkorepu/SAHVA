import test from "node:test";
import assert from "node:assert/strict";
import { sessionLines } from "../components/patient/ClinicTab";

test("days that share hours are one line, Monday first, in 12-hour time", () => {
  const lines = sessionLines(
    [
      { day_of_week: 3, starts_at: "09:00", ends_at: "13:00" },
      { day_of_week: 1, starts_at: "09:00", ends_at: "13:00" },
      { day_of_week: 1, starts_at: "17:30", ends_at: "20:00" },
      { day_of_week: 0, starts_at: "09:00", ends_at: "13:00" },
    ],
    false,
  );
  assert.deepEqual(lines, ["Mon, Wed, Sun · 9 AM – 1 PM", "Mon · 5:30 PM – 8 PM"]);
});

test("Telugu day names", () => {
  assert.deepEqual(sessionLines([{ day_of_week: 4, starts_at: "10:00", ends_at: "12:00" }], true), ["గురు · 10 AM – 12 PM"]);
});

test("a working week reads as a range", () => {
  const week = [1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, starts_at: "09:00", ends_at: "13:00" }));
  assert.deepEqual(sessionLines(week, false), ["Mon–Sat · 9 AM – 1 PM"]);
  assert.deepEqual(sessionLines([...week.slice(0, 2), { day_of_week: 4, starts_at: "09:00", ends_at: "13:00" }], false), ["Mon, Tue, Thu · 9 AM – 1 PM"]);
});
