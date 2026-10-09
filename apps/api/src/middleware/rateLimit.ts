import rateLimit, { type Store } from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";

/**
 * Rate limiting.
 *
 * Two things matter here beyond "set a number":
 *
 *  1. **Key by identity, not only by IP.** A whole town behind one carrier NAT
 *     shares an IP, so an IP-only limit either punishes a village or lets a
 *     single attacker hide in it. Auth attempts are keyed by IP *and* the
 *     identifier being attacked.
 *
 *  2. **The store must be shared.** An in-memory limiter resets on deploy and
 *     is per-instance, so N instances multiply every limit by N. When REDIS_URL
 *     is set the counters move to Redis; otherwise memory, which is honest for
 *     a single box and documented as such.
 */

let sharedStore: Store | undefined;

export async function initRateLimitStore(): Promise<"redis" | "memory"> {
  if (!env.REDIS_URL) {
    logger.warn(
      "rate limiting is using in-memory counters: they reset on restart and are per-instance. Set REDIS_URL before running more than one.",
    );
    return "memory";
  }
  try {
    const [{ default: RedisStore }, { createClient }] = await Promise.all([
      import("rate-limit-redis"),
      import("redis"),
    ]);
    const client = createClient({ url: env.REDIS_URL });
    client.on("error", (err: unknown) => logger.error({ err }, "redis error"));
    await client.connect();
    sharedStore = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
    }) as unknown as Store;
    logger.info("rate limiting backed by redis");
    return "redis";
  } catch (err) {
    // A Redis outage must not take the API down; fall back loudly.
    logger.error({ err }, "redis unavailable — falling back to in-memory rate limiting");
    return "memory";
  }
}

const tooMany = (message: string) =>
  (_req: Request, _res: Response, next: (e: unknown) => void) =>
    next(new AppError(429, "TOO_MANY_REQUESTS", message));

function make(opts: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: sharedStore,
    keyGenerator: opts.keyGenerator,
    handler: tooMany(opts.message),
  });
}

/** Normal authenticated API traffic. */
export const apiLimiter = () =>
  make({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: "Too many requests. Please slow down.",
  });

/** Telephony and the voice orchestrator: one call is many turns. */
export const machineLimiter = () =>
  make({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX * 5,
    message: "Too many requests.",
  });

/**
 * Portal links. These URLs are the one part of the surface a stranger can
 * reach, and a token is guessable only by brute force — so the limit is what
 * makes brute force pointless rather than merely expensive.
 */
export const portalLimiter = () =>
  make({
    windowMs: 60_000,
    max: 30,
    message: "Too many attempts. Please wait a minute and try again.",
  });

/**
 * Credential endpoints: claiming an account, setting a password.
 *
 * Keyed by IP *and* the identifier under attack, so spraying one password
 * across many accounts is limited per account, and hammering one account is
 * limited per IP.
 */
export const authLimiter = () =>
  make({
    windowMs: 15 * 60_000,
    max: 8,
    message: "Too many attempts. Please wait 15 minutes and try again.",
    keyGenerator: (req) => {
      const ip = req.ip ?? "unknown";
      const body = (req.body ?? {}) as { phone?: string; email?: string };
      const who = (body.phone ?? body.email ?? req.params.token ?? "").toLowerCase();
      return `${ip}:${who}`;
    },
  });
