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
/** An optional value left blank in .env (`KEY=`) means not set, not invalid. */
const optional = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t.optional());

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

  /**
   * Razorpay, for clinic subscriptions. Optional: without them the billing
   * page says payments are not set up yet, and nothing else is affected.
   * Use test-mode keys (rzp_test_…) everywhere but production — live keys
   * are refused outside it, so a dev machine can never take real money.
   */
  RAZORPAY_KEY_ID: optional(z.string().regex(/^rzp_(test|live)_\w+$/, "must look like rzp_test_…")),
  RAZORPAY_KEY_SECRET: optional(z.string().min(10)),
  /** Set in Razorpay → Webhooks; signs payment.captured events. */
  RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(8)),

  /**
   * Email, through Resend (resend.com). Optional: without them notifications
   * wait in the outbox (and are dropped after 7 days) — nothing else breaks.
   * EMAIL_FROM must be on a domain verified in Resend, e.g.
   * "SAHVA <notifications@sahva.in>".
   */
  RESEND_API_KEY: optional(z.string().startsWith("re_")),
  EMAIL_FROM: optional(z.string().min(5)),
  /** Where links in emails point: the clinic app, and the admin console. */
  WEB_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_URL: optional(z.string().url()),
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
