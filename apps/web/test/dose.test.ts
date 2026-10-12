import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDose } from "../lib/dose";

const slots = (f: string | null, i: string | null) => {
  const d = parseDose(f, i);
  return d.slots ? [...d.slots].sort() : null;
};

test("the 1-0-1 shorthand", () => {
  assert.deepEqual(slots("1-0-1", null), ["morning", "night"]);
  assert.deepEqual(slots("1-1-1", null), ["afternoon", "morning", "night"]);
  assert.deepEqual(slots("0 - 0 - 1", null), ["night"]);
});

test("a count that matches the times named", () => {
  assert.deepEqual(slots("Twice daily", "Take after breakfast and after dinner."), ["morning", "night"]);
  assert.deepEqual(slots("Once daily", "Take one tablet every morning after breakfast."), ["morning"]);
  assert.deepEqual(slots("OD", "at bedtime"), ["night"]);
});

test("no chart when the timing is not stated — never a guess", () => {
  assert.equal(slots("Once daily", null), null);
  assert.equal(slots("Thrice daily", "with water"), null);
  assert.equal(parseDose("Twice daily", null).perDay, 2);
});

test("no chart when the words disagree with each other", () => {
  // Says twice a day but names three times.
  assert.equal(slots("Twice daily", "morning, afternoon and night"), null);
  // Pattern says morning only; instructions say night.
  assert.equal(slots("1-0-0", "take at night"), null);
});

test("food timing, and nothing when it is contradictory or absent", () => {
  assert.equal(parseDose("1-0-1", "after food").food, "after");
  assert.equal(parseDose("1-0-0", "on an empty stomach").food, "before");
  assert.equal(parseDose("1-0-1", "before breakfast, after dinner").food, null);
  assert.equal(parseDose("1-0-1", null).food, null);
});

test("unrecognised patterns give no chart", () => {
  assert.equal(slots("1/2-0-1", null), null);
  assert.equal(slots("SOS", "when in pain"), null);
});
