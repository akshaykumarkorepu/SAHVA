import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { errorHandler, notFoundHandler } from "../src/middleware/errorHandler.js";
import { AppError, conflict } from "../src/lib/errors.js";

function capture(err: unknown, req: Partial<Request> = {}) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: Record<string, unknown>) {
      body = b;
      return this;
    },
  } as unknown as Response;

  errorHandler(err, { id: "req-1", ...req } as Request, res, (() => {}) as never);
  return { status, body };
}

test("every failure comes back in one envelope", () => {
  const { status, body } = capture(conflict("SLOT_TAKEN", "That time has gone.", "Offer another."));
  assert.equal(status, 409);
  assert.deepEqual(body, {
    error: {
      code: "SLOT_TAKEN",
      message: "That time has gone.",
      detail: undefined,
      hint: "Offer another.",
    },
    requestId: "req-1",
  });
});

test("the request id is always present so a log line can be found", () => {
  const { body } = capture(new Error("boom"));
  assert.equal((body as { requestId: string }).requestId, "req-1");
});

test("an unknown error becomes a 500 without leaking the stack", () => {
  const { status, body } = capture(new Error("connection string: postgres://secret"));
  assert.equal(status, 500);
  const e = (body as { error: { code: string; message: string } }).error;
  assert.equal(e.code, "INTERNAL_ERROR");
  assert.equal(e.message, "Something went wrong.");
});

test("malformed JSON is a 400, not a 500", () => {
  const syntax = Object.assign(new SyntaxError("Unexpected token"), { body: "{bad" });
  const { status, body } = capture(syntax);
  assert.equal(status, 400);
  assert.equal((body as { error: { code: string } }).error.code, "MALFORMED_JSON");
});

test("an unmatched route returns JSON, not Express HTML", () => {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: Record<string, unknown>) {
      body = b;
      return this;
    },
  } as unknown as Response;

  notFoundHandler({ id: "req-2", method: "GET", path: "/api/nope" } as Request, res);
  assert.equal(status, 404);
  assert.equal((body as { error: { code: string } }).error.code, "ROUTE_NOT_FOUND");
});

test("a 4xx keeps its detail; the client needs it to fix the request", () => {
  const { body } = capture(new AppError(400, "VALIDATION_FAILED", "Invalid.", "body.phone bad"));
  assert.equal((body as { error: { detail?: string } }).error.detail, "body.phone bad");
});
