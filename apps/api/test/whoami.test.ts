import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { accountKind } from "../src/middleware/admin.js";

const base = { admin: false, member: false, patient: false, staffProfile: false };

test("a clinic member is staff, whatever tab they signed in on", () => {
  assert.equal(accountKind({ ...base, member: true, staffProfile: true }), "staff");
});

test("a patient account is a patient", () => {
  assert.equal(accountKind({ ...base, patient: true }), "patient");
});

test("staff who have not set up a clinic yet go to clinic set-up", () => {
  assert.equal(accountKind({ ...base, staffProfile: true }), "staff_no_clinic");
});

test("an admin is an admin first", () => {
  assert.equal(accountKind({ ...base, admin: true, staffProfile: true }), "admin");
});

test("an account linked to nothing is none", () => {
  assert.equal(accountKind(base), "none");
});
