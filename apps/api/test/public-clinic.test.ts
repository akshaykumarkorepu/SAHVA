import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { indianMobile } from "../src/routes/publicClinic.js";

test("mobile numbers are accepted the ways people type them", () => {
  for (const raw of ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "09876543210"]) {
    assert.equal(indianMobile(raw), "+919876543210", raw);
  }
});

test("landlines, short numbers and foreign numbers are refused", () => {
  for (const raw of ["040 2345 6789", "12345", "5876543210", "+1 415 555 0100", "98765432101"]) {
    assert.equal(indianMobile(raw), null, raw);
  }
});
