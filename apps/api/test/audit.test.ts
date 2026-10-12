import { strict as assert } from "node:assert";
import test from "node:test";
import { recordAccess } from "../src/lib/audit.js";
import { AppError } from "../src/lib/errors.js";

const silent = { error: () => undefined } as never;
const req = { id: "req-123", log: silent };

function fakeDb(error: { code: string; message: string } | null) {
  const calls: unknown[] = [];
  return {
    calls,
    db: { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { error }) } as never,
  };
}

test("a read is logged with the patient, the record type and the request id", async () => {
  const f = fakeDb(null);
  await recordAccess(f.db, req, "patient-1", "medical_record");
  assert.deepEqual(f.calls, [
    ["log_record_access", { p_patient_id: "patient-1", p_record_type: "medical_record", p_request_id: "req-123" }],
  ]);
});

test("if the read cannot be logged, the record is not served", async () => {
  await assert.rejects(
    recordAccess(fakeDb({ code: "08006", message: "connection failure" }).db, req, "p", "medical_record"),
    (e: unknown) => e instanceof AppError && e.status === 503,
  );
});

test("a caller with no right to the record is refused, not just unlogged", async () => {
  await assert.rejects(
    recordAccess(fakeDb({ code: "42501", message: "Not permitted" }).db, req, "p", "patient_profile"),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
});
