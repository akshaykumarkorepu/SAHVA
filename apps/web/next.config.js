/** @type {import('next').NextConfig} */

/**
 * Load the monorepo's root `.env`.
 *
 * Next only reads `.env` from the app directory (apps/web), but README and
 * docs/setup.md both tell you to put one file at the repo root — so a
 * correctly-followed setup produced a web app that reported "Supabase is not
 * configured" while .env sat two directories up. apps/api had the same bug;
 * see the note in src/config/env.ts.
 *
 * A local apps/web/.env still wins, and so does a real environment variable:
 * dotenv never overwrites what is already set.
 */
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

for (let dir = __dirname; ; ) {
  const candidate = join(dir, ".env");
  if (existsSync(candidate) && dir !== __dirname) {
    require("dotenv").config({ path: candidate });
    break;
  }
  const parent = resolve(dir, "..");
  if (parent === dir) break;
  dir = parent;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: API_BASE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    // Listed here so it is always substituted with a literal. An *undefined*
    // env var is left as `process.env.X` in the output, which webpack cannot
    // fold — and the mock-mode branch in lib/api.ts then survives minification
    // and ships the fixtures. Defaulting to "" makes the comparison provably
    // false and the branch, plus apps/web/lib/mock, disappears.
    NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK || "",
  },
  // The API enforces auth itself; this rewrite only saves a CORS hop in dev.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },
};

module.exports = nextConfig;
