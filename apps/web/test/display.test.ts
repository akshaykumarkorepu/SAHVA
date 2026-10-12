import { test } from "node:test";
import assert from "node:assert/strict";
import { changedNext, queues } from "../lib/display";

const r = (doctor: string, token: number, status: string) => ({
  doctor_id: doctor,
  doctor_name: doctor === "a" ? "Dr Anitha" : "Dr Ramesh",
  colour_hex: null,
  status,
  token_number: token,
});

test("next is the lowest checked-in token; booked-but-not-arrived patients are not in the line", () => {
  const [anitha] = queues([r("a", 5, "checked_in"), r("a", 3, "checked_in"), r("a", 1, "booked"), r("a", 2, "completed"), r("a", 7, "checked_in")]);
  assert.equal(anitha.next, 3);
  assert.deepEqual(anitha.waiting, [5, 7]);
  assert.equal(anitha.seen, 1);
});

test("a doctor with nobody waiting still appears, with no next", () => {
  const qs = queues([r("a", 1, "completed"), r("b", 2, "booked")]);
  assert.deepEqual(qs.map((q) => [q.doctorName, q.next]), [["Dr Anitha", null], ["Dr Ramesh", null]]);
});

test("the screen carries tokens only — no names of patients", () => {
  const json = JSON.stringify(queues([{ ...r("a", 4, "checked_in"), patient_name: "Lakshmi Devi" } as never]));
  assert.doesNotMatch(json, /Lakshmi/);
});

test("changedNext chimes only for doctors whose next token moved", () => {
  const before = queues([r("a", 3, "checked_in"), r("b", 8, "checked_in")]);
  const after = queues([r("a", 3, "completed"), r("a", 5, "checked_in"), r("b", 8, "checked_in")]);
  assert.deepEqual(changedNext(before, after), ["a"]);
  assert.deepEqual(changedNext(after, after), []);
});
