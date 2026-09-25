import test from "node:test";
import assert from "node:assert/strict";
import type { PostgrestError } from "@supabase/supabase-js";
import { AppError, fromPostgrest, unwrap } from "../src/lib/errors.js";

const pgError = (code: string, extra: Partial<PostgrestError> = {}): PostgrestError =>
  ({ code, message: "db said no", details: "some detail", hint: null, name: "PostgrestError", ...extra }) as PostgrestError;

test("the no-double-booking constraint becomes a 409 the caller can act on", () => {
  // 23P01 is appointments_no_double_booking firing. This is the single most
  // important mapping in the file: it must not surface as a 500.
  const e = fromPostgrest(pgError("23P01"), "booking");
  assert.equal(e.status, 409);
  assert.equal(e.code, "SLOT_TAKEN");
  assert.match(e.message, /no longer available/i);
  assert.ok(e.hint, "must tell the caller what to do next");
});

test("a cross-tenant foreign key is a conflict, not a server error", () => {
  const e = fromPostgrest(pgError("23503"), "booking");
  assert.equal(e.status, 409);
  assert.equal(e.code, "INVALID_REFERENCE");
  assert.match(e.message, /another clinic/i);
});

test("RLS refusal maps to 403, not 500", () => {
  const e = fromPostgrest(pgError("42501", { message: "AI cancellation is disabled" }), "cancel");
  assert.equal(e.status, 403);
  assert.equal(e.code, "FORBIDDEN");
  assert.equal(e.message, "AI cancellation is disabled");
});

test("missing rows map to 404 with the context in the message", () => {
  for (const code of ["P0002", "PGRST116"]) {
    const e = fromPostgrest(pgError(code), "appointment");
    assert.equal(e.status, 404, `${code} should be 404`);
    assert.match(e.message, /appointment/);
  }
});

test("check and not-null violations are 400s", () => {
  assert.equal(fromPostgrest(pgError("23514"), "x").status, 400);
  assert.equal(fromPostgrest(pgError("23502"), "x").status, 400);
  assert.equal(fromPostgrest(pgError("22P02"), "x").status, 400);
});

test("unique violation is a conflict", () => {
  const e = fromPostgrest(pgError("23505"), "x");
  assert.equal(e.status, 409);
  assert.equal(e.code, "ALREADY_EXISTS");
});

test("an unrecognised sqlstate falls back to 500 rather than being swallowed", () => {
  const e = fromPostgrest(pgError("XX000"), "doing a thing");
  assert.equal(e.status, 500);
  assert.equal(e.code, "DATABASE_ERROR");
  assert.match(e.message, /doing a thing/);
});

test("unwrap returns data and throws the mapped error", () => {
  assert.deepEqual(unwrap({ data: { id: "a" }, error: null }, "x"), { id: "a" });

  assert.throws(
    () => unwrap({ data: null, error: pgError("23P01") }, "booking"),
    (e: unknown) => e instanceof AppError && e.code === "SLOT_TAKEN",
  );
});

test("unwrap treats a null payload as not-found", () => {
  assert.throws(
    () => unwrap({ data: null, error: null }, "clinic"),
    (e: unknown) => e instanceof AppError && e.status === 404,
  );
});
