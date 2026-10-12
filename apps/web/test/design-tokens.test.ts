import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Colour utilities must come from this app's tokens (tailwind.config.ts).
 *
 * Tailwind silently generates nothing for a class it does not know, so a
 * leftover from an older palette — text-ink-900, bg-primary-50, bg-amber-50 —
 * renders as no colour at all and nothing fails. 122 of them had piled up,
 * including the background of the reschedule page's "nothing has been sent"
 * warning. This test is here so they cannot come back.
 */
const ROOTS = ["app", "components"].map((d) => join(import.meta.dirname, "..", d));

const FORBIDDEN =
  /(?<![\w-])(?:[a-z]+:)*(?:text|bg|border|ring|divide|from|to|via|fill|stroke|placeholder|outline)-(?:ink-\d+|primary-\d+|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?![\w-])/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

test("no colour classes outside the design tokens", () => {
  const offenders: string[] = [];
  for (const f of ROOTS.flatMap(files)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(FORBIDDEN)) offenders.push(`${f.split("/apps/web/")[1]}: ${m[0]}`);
  }
  assert.deepEqual(offenders, [], "use ink / ink-muted / ink-subtle / line / surface-* / brand-* / accent-*");
});
