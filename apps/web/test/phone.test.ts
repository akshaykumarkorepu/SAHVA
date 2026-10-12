import { test } from "node:test";
import assert from "node:assert/strict";
import { toIndianE164 } from "../lib/phone";

test("the ways people actually type a mobile number", () => {
  for (const s of ["9876543210", "98765 43210", "98765-43210", "+91 98765 43210", "+919876543210", "919876543210", "09876543210"]) {
    assert.equal(toIndianE164(s), "+919876543210", s);
  }
});

test("not a usable mobile number", () => {
  for (const s of ["", "12345", "1234567890", "+1 415 555 0100", "98765432101", "abc"]) {
    assert.equal(toIndianE164(s), null, s);
  }
});
