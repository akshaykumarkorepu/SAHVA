import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedDecisions, idProblems, ownerStatus, type VerificationStatus } from "../lib/verification";

const base = { idType: "hfr" as const, hfrId: "IN3610000099", regNo: "", regState: "", ownerRegNo: "TSMC/1234", ownerCouncil: "Telangana State Medical Council", gstin: "" };

test("a complete application has no problems", () => {
  assert.deepEqual(idProblems(base), []);
  assert.deepEqual(idProblems({ ...base, idType: "state", hfrId: "", regNo: "TS/CE/1", regState: "Telangana" }), []);
});

test("each missing piece is named", () => {
  assert.deepEqual(idProblems({ ...base, hfrId: "" }), ["The clinic's HFR ID"]);
  assert.deepEqual(idProblems({ ...base, idType: "state", regNo: "", regState: "" }), [
    "The state registration number",
    "The state that issued it",
  ]);
  assert.deepEqual(idProblems({ ...base, ownerRegNo: "", ownerCouncil: "" }), [
    "The owner doctor's registration number",
    "The council the doctor is registered with",
  ]);
  assert.deepEqual(idProblems({ ...base, gstin: "12345" }), ["A valid GSTIN (or leave it empty)"]);
  assert.deepEqual(idProblems({ ...base, gstin: "36abcde1234f1z5" }), [], "GSTIN is checked case-insensitively");
});

test("every status has words for the owner", () => {
  for (const s of ["submitted", "under_review", "needs_info", "approved", "rejected", "suspended"] as VerificationStatus[]) {
    assert.ok(ownerStatus(s).title.length > 5);
  }
});

test("the decisions offered match what the database allows", () => {
  // admin_review_clinic() lists, for each decision, the statuses it may come
  // from. Invert that and compare with what the screen offers.
  const sql = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261012000900_clinic_verification.sql"),
    "utf8",
  );
  const allowed = new Map<string, Set<string>>();
  for (const m of sql.matchAll(/when '(\w+)'\s+then v_to := '\w+';\s+v_from := array\[([^\]]+)\]/g)) {
    for (const from of m[2].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1))) {
      if (!allowed.has(from)) allowed.set(from, new Set());
      allowed.get(from)!.add(m[1]);
    }
  }
  for (const s of ["submitted", "under_review", "needs_info", "approved", "rejected", "suspended"] as VerificationStatus[]) {
    assert.deepEqual(new Set(allowedDecisions(s)), allowed.get(s) ?? new Set(), s);
  }
});
