import pino from "pino";
import { env, isProd } from "../config/env.js";

/**
 * One JSON line per event in production; human-readable in development.
 * `redact` is not optional here — this service handles patient phone numbers
 * and auth tokens, and neither belongs in a log aggregator.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-sahva-key"]',
      "*.phone_e164",
      "*.from_e164",
      "*.to_e164",
      "*.alt_phone_e164",
      "body.phone",
      "body.p_phone_e164",
    ],
    censor: "[redacted]",
  },
  transport: isProd
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});

export type Logger = typeof logger;
