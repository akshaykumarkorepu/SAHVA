import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * PostgREST embeds must name their foreign key when the target is reachable
 * more than once.
 *
 * `clinic_members` reaches `staff_profiles` through both `staff_id` and
 * `invited_by`. A bare `staff_profiles(...)` is therefore ambiguous, and
 * PostgREST does not pick one — it refuses the whole query, so the route
 * returns 500 and the page is simply broken. Nothing else catches this: the
 * API tests run against a stub, and the database tests have no PostgREST, so
 * it only appears when someone opens that screen against a real project.
 *
 * It has already happened twice, in actions.ts and then staff.ts, which is
 * what this test is here to stop.
 *
 * The pairs below come from the schema: every table with two or more foreign
 * keys to the same target. If a migration adds another, add it here.
 */
const AMBIGUOUS: Record<string, string[]> = {
  staff_profiles: ["action_items", "clinic_members", "reschedule_batches"],
  appointments: ["reschedule_batch_items"],
  // items.message_id → messages, and messages.batch_item_id → items.
  messages: ["reschedule_batch_items"],
  calls: ["calls"],
};

const ROUTES = join(import.meta.dirname, "..", "src", "routes");

function routeFiles(): string[] {
  return readdirSync(ROUTES).filter((f) => f.endsWith(".ts"));
}

test("every embed of an ambiguous relation names its foreign key", () => {
  const offenders: string[] = [];

  for (const file of routeFiles()) {
    const src = readFileSync(join(ROUTES, file), "utf8");

    // Strip comments so prose about the problem is not read as the problem.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    for (const target of Object.keys(AMBIGUOUS)) {
      // `target(` not preceded by `!` — i.e. an embed that did not name the FK.
      const bare = new RegExp(`(?<![!\\w])${target}\\s*\\(`, "g");
      for (const m of code.matchAll(bare)) {
        const line = code.slice(0, m.index).split("\n").length;
        offenders.push(
          `${file}:${line} embeds \`${target}(...)\` without a foreign key. ` +
            `Use \`${target}!<constraint>_fkey(...)\`.`,
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Ambiguous PostgREST embed(s) — these return 500 at runtime:\n  ${offenders.join("\n  ")}`,
  );
});

test("the guard actually catches a bare embed", () => {
  // Guard against the regex silently matching nothing and the test passing
  // for the wrong reason.
  const sample = `db.from("clinic_members").select("role, staff_profiles(id, full_name)")`;
  const bare = new RegExp(`(?<![!\\w])staff_profiles\\s*\\(`, "g");
  assert.equal([...sample.matchAll(bare)].length, 1);

  const fixed = `db.from("clinic_members").select("role, staff_profiles!clinic_members_staff_id_fkey(id)")`;
  assert.equal([...fixed.matchAll(bare)].length, 0);
});
