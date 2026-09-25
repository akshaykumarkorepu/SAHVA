import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { Request, Response } from "express";
import { validate, phoneE164, isoDate, paginationQuery } from "../src/middleware/validate.js";
import { AppError } from "../src/lib/errors.js";

function run(schemas: Parameters<typeof validate>[0], req: Partial<Request>) {
  let err: unknown = null;
  const next = (e?: unknown) => {
    err = e ?? null;
  };
  validate(schemas)(req as Request, {} as Response, next as never);
  return { err, req };
}

test("parsed values replace the raw request parts", () => {
  // Handlers must never re-parse strings themselves.
  const { err, req } = run(
    { query: paginationQuery },
    { query: { limit: "25", offset: "10" } as never },
  );
  assert.equal(err, null);
  assert.deepEqual(req.query, { limit: 25, offset: 10 });
  assert.equal(typeof (req.query as { limit: unknown }).limit, "number");
});

test("pagination has safe defaults and an upper bound", () => {
  assert.deepEqual(paginationQuery.parse({}), { limit: 50, offset: 0 });
  // Without a cap, one request could pull a whole clinic's history.
  assert.equal(paginationQuery.safeParse({ limit: "5000" }).success, false);
  assert.equal(paginationQuery.safeParse({ offset: "-1" }).success, false);
});

test("a validation failure names the offending field", () => {
  const { err } = run(
    { body: z.object({ phone: phoneE164 }) },
    { body: { phone: "12345" } },
  );
  assert.ok(err instanceof AppError);
  assert.equal((err as AppError).status, 400);
  assert.equal((err as AppError).code, "VALIDATION_FAILED");
  assert.match((err as AppError).detail ?? "", /body\.phone/);
  assert.match((err as AppError).detail ?? "", /E\.164/);
});

test("phone and date primitives match the database's own constraints", () => {
  assert.equal(phoneE164.safeParse("+919885512345").success, true);
  assert.equal(phoneE164.safeParse("+0119885512345").success, false, "must not start with 0");
  assert.equal(phoneE164.safeParse("9885512345").success, false);

  assert.equal(isoDate.safeParse("2026-09-28").success, true);
  assert.equal(isoDate.safeParse("2026-9-8").success, false);
});

test("params, query and body are all checked", () => {
  const { err } = run(
    { params: z.object({ id: z.string().uuid() }) },
    { params: { id: "not-a-uuid" } as never },
  );
  assert.ok(err instanceof AppError);
  assert.match((err as AppError).detail ?? "", /params\.id/);
});
