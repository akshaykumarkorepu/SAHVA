import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_GUIDE, countByCategory } from "../lib/actions";

test("every action type says why it needs a person and what to do", () => {
  for (const [type, g] of Object.entries(ACTION_GUIDE)) {
    assert.ok(g.why.length > 20, `${type}: why`);
    assert.ok(g.next.length > 5, `${type}: next`);
  }
});

test("only reschedules and online requests close themselves — everything else needs a person to say so", () => {
  // A reschedule closes when its last patient is handled; an online request
  // when its appointment is confirmed or cancelled (a database trigger).
  const self = Object.entries(ACTION_GUIDE).filter(([, g]) => g.closesItself).map(([t]) => t).sort();
  assert.deepEqual(self, ["online_request", "reschedule_needed"]);
});

test("countByCategory groups by what the item is about", () => {
  assert.deepEqual(
    countByCategory([
      { type: "reschedule_needed" },
      { type: "failed_message" },
      { type: "low_confidence_call" },
      { type: "ai_escalation" },
      { type: null },
    ]),
    { appointments: 1, messages: 1, ai: 2 },
  );
});
