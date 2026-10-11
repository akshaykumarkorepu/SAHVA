import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

/**
 * Anthropic client, built on first use rather than at import time.
 *
 * The key is only needed by the voice route. Constructing the client eagerly
 * made a missing key fatal for the whole process — `index.ts` imports the voice
 * router unconditionally, so the dashboard, the patient portal and every other
 * route went down with it. That is the wrong trade for a feature that has no
 * carrier, no STT and no TTS wired yet (see docs/setup.md).
 *
 * Now a missing key costs exactly the thing that needs it: a voice call fails
 * with AI_NOT_CONFIGURED, and everything else runs.
 */
let client: Anthropic | null = null;

export const isAiConfigured = Boolean(env.ANTHROPIC_API_KEY);

export function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(
      503,
      "AI_NOT_CONFIGURED",
      "The AI receptionist is not configured on this server.",
      "ANTHROPIC_API_KEY is unset.",
      "Set ANTHROPIC_API_KEY in .env and restart. See docs/setup.md.",
    );
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3 });
  return client;
}

export const MODEL = env.ANTHROPIC_MODEL;
