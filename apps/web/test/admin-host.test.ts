import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdminRoute } from "../lib/adminHost";

const ADMIN = "admin.sahva.in";

test("without ADMIN_HOST (local development) everything is served", () => {
  assert.deepEqual(decideAdminRoute("localhost:3000", "/admin", undefined), { kind: "next" });
});

test("on the clinic domain, /admin does not exist", () => {
  for (const p of ["/admin", "/admin/signin", "/admin/audit"]) {
    assert.deepEqual(decideAdminRoute("app.sahva.in", p, ADMIN), { kind: "not_found" }, p);
  }
  assert.deepEqual(decideAdminRoute("app.sahva.in", "/dashboard", ADMIN), { kind: "next" });
  // A lookalike path is not the console.
  assert.deepEqual(decideAdminRoute("app.sahva.in", "/administrator", ADMIN), { kind: "next" });
});

test("on the admin host, only the console and shared assets are served", () => {
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/admin/signin", ADMIN), { kind: "next" });
  assert.deepEqual(decideAdminRoute("ADMIN.sahva.in:443", "/admin", ADMIN), { kind: "next" });
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/_next/static/x.js", ADMIN), { kind: "next" });
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/", ADMIN), { kind: "redirect", to: "/admin" });
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/dashboard", ADMIN), { kind: "redirect", to: "/admin" });
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/me", ADMIN), { kind: "redirect", to: "/admin" });
});
