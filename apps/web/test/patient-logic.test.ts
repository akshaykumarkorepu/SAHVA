import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOwed, buildTiles, daysFromToday, isActiveRx, rupees } from "../components/patient/logic";
import type { Invoice, Prescription, RxItem, Vaccination } from "../components/patient/types";

const DAY = 86_400_000;

/** Local calendar date, offset from today — the shape care_tasks.due_on uses. */
function localIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function item(duration_days: number | null): RxItem {
  return {
    drug_name: "Paracetamol",
    strength: "500 mg",
    form: "tablet",
    dosage: "1 tab",
    frequency: "1-0-1",
    duration_days,
    instructions_en: null,
    instructions_te: null,
  };
}

function rx(issuedDaysAgo: number, durations: (number | null)[]): Prescription {
  return {
    id: "rx",
    issued_at: new Date(Date.now() - issuedDaysAgo * DAY).toISOString(),
    notes: null,
    doctor_name: "Dr Anitha",
    items: durations.map(item),
  };
}

function invoice(status: Invoice["status"], total_paise: number): Invoice {
  return {
    id: status,
    invoice_number: "INV-1",
    total_paise,
    status,
    payment_mode: null,
    issued_at: null,
    paid_at: null,
    items: [],
  };
}

function vaccination(status: Vaccination["status"]): Vaccination {
  return {
    id: status,
    vaccine_code: "MMR",
    dose_number: 1,
    due_date: null,
    administered_at: null,
    status,
    vaccine_catalogue: null,
  };
}

test("isActiveRx: a course still running is active", () => {
  assert.equal(isActiveRx(rx(2, [5])), true);
});

test("isActiveRx: a finished course is not", () => {
  assert.equal(isActiveRx(rx(10, [5])), false);
});

test("isActiveRx: the longest item decides, not the first", () => {
  assert.equal(isActiveRx(rx(10, [3, 30])), true);
});

test("isActiveRx: no durations at all is never active", () => {
  // Without a duration there is no end date, and claiming a medicine is
  // current when we cannot know is worse than leaving it in history.
  assert.equal(isActiveRx(rx(0, [null, null])), false);
});

test("daysFromToday: today, tomorrow, yesterday", () => {
  assert.equal(daysFromToday(localIso(0)), 0);
  assert.equal(daysFromToday(localIso(1)), 1);
  assert.equal(daysFromToday(localIso(-1)), -1);
  assert.equal(daysFromToday(localIso(-14)), -14);
});

test("rupees: paise to whole rupees with Indian grouping", () => {
  assert.equal(rupees(30_000), "₹300");
  assert.equal(rupees(1_23_45_600), "₹1,23,456");
});

test("amountOwed: only issued invoices are owed", () => {
  const owed = amountOwed([
    invoice("issued", 50_000),
    invoice("paid", 70_000),
    invoice("draft", 90_000),
    invoice("void", 10_000),
    invoice("issued", 25_000),
  ]);
  assert.equal(owed, 75_000);
});

test("buildTiles: an empty record shows no tiles, not a row of zeroes", () => {
  assert.deepEqual(buildTiles({ L: false, activeRx: [], vaccinesDue: [], owed: 0, conditions: [] }), []);
});

test("buildTiles: money owed is a warning tile", () => {
  const [tile] = buildTiles({ L: false, activeRx: [], vaccinesDue: [], owed: 30_000, conditions: [] });
  assert.equal(tile.icon, "rupee");
  assert.equal(tile.value, "₹300");
  assert.equal(tile.tone, "warn");
});

test("buildTiles: vaccines warn only when one is overdue", () => {
  const due = buildTiles({ L: false, activeRx: [], vaccinesDue: [vaccination("due")], owed: 0, conditions: [] });
  assert.equal(due[0].tone, undefined);
  const overdue = buildTiles({
    L: false,
    activeRx: [],
    vaccinesDue: [vaccination("due"), vaccination("overdue")],
    owed: 0,
    conditions: [],
  });
  assert.equal(overdue[0].tone, "warn");
  assert.equal(overdue[0].value, "2");
});

test("buildTiles: medicines count items across active prescriptions", () => {
  const [tile] = buildTiles({
    L: true,
    activeRx: [rx(1, [5, 5]), rx(1, [7])],
    vaccinesDue: [],
    owed: 0,
    conditions: [],
  });
  assert.equal(tile.value, "3");
  assert.equal(tile.label, "ప్రస్తుత మందులు");
});
