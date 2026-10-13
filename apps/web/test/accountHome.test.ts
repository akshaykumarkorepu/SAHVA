import test from "node:test";
import assert from "node:assert/strict";
import { homeFor } from "../lib/accountHome";

test("staff go to the dashboard, even if the link asked for the patient page", () => {
  assert.equal(homeFor("staff", "/me"), "/dashboard");
  assert.equal(homeFor("staff", null), "/dashboard");
  assert.equal(homeFor("staff", "/dashboard/appointments"), "/dashboard/appointments");
});

test("patients go to /me, never to clinic registration", () => {
  assert.equal(homeFor("patient", "/dashboard"), "/me");
  assert.equal(homeFor("patient", "/me"), "/me");
});

test("staff without a clinic yet go to the dashboard, which offers set-up", () => {
  assert.equal(homeFor("staff_no_clinic", "/me"), "/dashboard");
});

test("admins have no home on the clinic site", () => {
  assert.equal(homeFor("admin", "/dashboard"), null);
});

test("next can never send someone off-site", () => {
  assert.equal(homeFor("staff", "//evil.example/dashboard"), "/dashboard");
  assert.equal(homeFor("patient", "https://evil.example/me"), "/me");
});
