import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Fail fast and loudly on misconfiguration. A server that boots with a missing
 * key and only discovers it on the first patient call is worse than one that
 * refuses to start.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  /**
   * Bypasses RLS entirely. Server-side only — never expose to a browser, never
   * prefix with NEXT_PUBLIC_.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  ANTHROPIC_API_KEY: z.string().min(10),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  /** Shared secret for machine callers (telephony webhook, voice orchestrator). */
  VOICE_API_KEY: z.string().min(32),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

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
