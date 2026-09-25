import type { TablesInsert } from "@sahva/types";
import { dbAdmin } from "./supabase.js";
import { logger } from "./logger.js";

/**
 * Vendor unit costs in micro-INR (1 INR = 1,000,000 micro-INR).
 *
 * Integers, because LLM token pricing rounds to zero in paise and floats drift
 * across millions of rows. These are the blueprint's quoted rates — replace
 * each one with the figure from that vendor's actual invoice as soon as you
 * have one, because pricing decisions are made off this table.
 */
export const UNIT_COST_MICRO_INR = {
  /** ~₹40 per hour of audio (Sarvam Saaras). */
  stt_seconds: 11_111,
  /** ~₹22 per 10,000 characters (Sarvam Bulbul). */
  tts_characters: 2_200,
  llm_input_tokens: 13,
  llm_output_tokens: 66,
  /** ~₹0.50 per minute. */
  telephony_seconds: 8_333,
  whatsapp_message: 880_000,
  sms_message: 200_000,
} as const;

export type UsageKind = keyof typeof UNIT_COST_MICRO_INR;

export type UsageEntry = {
  kind: UsageKind;
  provider: string;
  quantity: number;
};

/**
 * Build the rows for a set of metered entries.
 *
 * Zero-quantity entries are dropped: a turn with no TTS characters should not
 * leave a row claiming it cost nothing, because "no row" and "a free row" mean
 * different things when reconciling against a vendor invoice.
 */
export function buildUsageRows(
  clinicId: string,
  callId: string | null,
  entries: UsageEntry[],
): TablesInsert<"usage_events">[] {
  return entries
    .filter((e) => e.quantity > 0)
    .map((e) => ({
      clinic_id: clinicId,
      call_id: callId,
      kind: e.kind,
      provider: e.provider,
      quantity: e.quantity,
      unit_cost_micro_inr: UNIT_COST_MICRO_INR[e.kind],
    }));
}

/**
 * Records metered vendor usage for a call.
 *
 * Deliberately best-effort: a metering failure must never fail a patient's
 * booking. It is logged loudly instead, because silently losing cost data means
 * pricing the product on guesses.
 */
export async function recordUsage(
  clinicId: string,
  callId: string | null,
  entries: UsageEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const rows = buildUsageRows(clinicId, callId, entries);
  if (rows.length === 0) return;

  const { error } = await dbAdmin.from("usage_events").insert(rows);
  if (error) {
    logger.error({ err: error, clinicId, callId }, "failed to record usage events");
  }
}
