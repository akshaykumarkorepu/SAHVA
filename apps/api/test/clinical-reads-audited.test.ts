import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Every read of clinical data must be logged (record_access_log). The routes
 * that do it call recordAccess() first; this stops a new route quietly
 * reading diagnoses or prescriptions without it.
 *
 * Checked per handler, not per file: each `router.get(...)` block that names
 * a clinical table must also call recordAccess.
 */
const CLINICAL = [
  "consultations",
  "prescriptions",
  "prescription_items",
  "patient_conditions",
  "patient_vaccinations",
  "v_patient_medical_history",
  "v_patient_prescriptions",
];

const ROUTES = join(import.meta.dirname, "..", "src", "routes");

test("every route that reads clinical tables logs the read first", () => {
  const offenders: string[] = [];
  for (const file of readdirSync(ROUTES).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(ROUTES, file), "utf8");
    // Split into handler blocks at each `<router>.get(`.
    const blocks = src.split(/\n(?=\w+\.get\()/);
    for (const block of blocks) {
      if (!/^\w+\.get\(/.test(block)) continue;
      const reads = CLINICAL.filter((t) => block.includes(`from("${t}")`));
      if (reads.length > 0 && !block.includes("recordAccess(")) {
        offenders.push(`${file}: ${block.split("\n")[1]?.trim()} reads ${reads.join(", ")}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
