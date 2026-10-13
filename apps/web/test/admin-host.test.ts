import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdminRoute, siteMode } from "../lib/adminHost";

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

test("SITE_MODE=admin: the console deployment serves only the console, on any host", () => {
  // Vercel preview URLs are random: the mode, not the host, decides.
  assert.deepEqual(decideAdminRoute("sahva-admin-git-x.vercel.app", "/admin/signin", undefined, "admin"), { kind: "next" });
  assert.deepEqual(decideAdminRoute("sahva-admin-git-x.vercel.app", "/", undefined, "admin"), { kind: "redirect", to: "/admin" });
  assert.deepEqual(decideAdminRoute("sahva-admin-git-x.vercel.app", "/dashboard", undefined, "admin"), { kind: "redirect", to: "/admin" });
  assert.deepEqual(decideAdminRoute("sahva-admin-git-x.vercel.app", "/brand/logo.svg", undefined, "admin"), { kind: "next" });
});

test("SITE_MODE=clinic: the clinic deployment has no console, whatever ADMIN_HOST says", () => {
  assert.deepEqual(decideAdminRoute("sahva.vercel.app", "/admin/signin", undefined, "clinic"), { kind: "not_found" });
  assert.deepEqual(decideAdminRoute("admin.sahva.in", "/admin", "admin.sahva.in", "clinic"), { kind: "not_found" });
  assert.deepEqual(decideAdminRoute("sahva.vercel.app", "/", undefined, "clinic"), { kind: "next" });
});

test("only the two known modes count", () => {
  assert.equal(siteMode("admin"), "admin");
  assert.equal(siteMode("clinic"), "clinic");
  assert.equal(siteMode("Admin"), undefined);
  assert.equal(siteMode(""), undefined);
});
