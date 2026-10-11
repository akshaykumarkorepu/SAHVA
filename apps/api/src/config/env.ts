import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Find `.env` by walking up from this file.
 *
 * dotenv resolves relative to the *process* working directory, which for
 * `tsx watch src/index.ts` is apps/api — not the repo root, where README and
 * docs/setup.md both tell you to put the file. The result was an API that
 * refused to boot on a correctly-followed setup, listing every variable as
 * missing while .env sat two directories up.
 *
 * Walking up also survives the build, where this module lives at
 * dist/apps/api/src/config/ instead.
 */
function findEnvFile(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Real environment variables always win: dotenv does not overwrite them.
const envFile = findEnvFile();
if (envFile) loadDotenv({ path: envFile });
loadDotenv();

/**
 * Fail fast and loudly on misconfiguration. A server that boots with a missing
 * key and only discovers it on the first patient call is worse than one that
 * refuses to start.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // "silent" is a real pino level and is what the test suite runs at.
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  /**
   * Bypasses RLS entirely. Server-side only — never expose to a browser, never
   * prefix with NEXT_PUBLIC_.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  /**
   * Optional. Only the voice route uses it; see claude/client.ts. Requiring it
   * here took the whole API down over a feature that is not wired to a carrier
   * yet, so a voice call now fails with AI_NOT_CONFIGURED instead.
   */
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  /** Shared secret for machine callers (telephony webhook, voice orchestrator). */
  VOICE_API_KEY: z.string().min(32),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

  /**
   * Optional. Without it, rate-limit counters live in memory: they reset on
   * restart and are per-instance, so running more than one instance multiplies
   * every limit. Set this before scaling past one box.
   */
  REDIS_URL: z.string().url().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // Deliberately not using the logger: it depends on this module.
  console.error(`\n[config] Invalid environment.\n${details}\n`);
  console.error("Copy .env.example to .env and fill in the values.\n");
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
