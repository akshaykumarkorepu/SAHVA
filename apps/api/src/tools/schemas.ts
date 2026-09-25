import { z } from "zod";
import { phoneE164, isoDate } from "../middleware/validate.js";

/**
 * What the model is allowed to ask for. These are validated before anything
 * reaches the database, so a malformed tool call becomes a clear, recorded
 * refusal rather than a Postgres error mid-conversation.
 */

/** ISO-8601 with an explicit offset. The model must not send naive local time. */
const instant = z
  .string()
  .datetime({ offset: true })
  .describe("ISO-8601 with offset, e.g. 2026-09-28T10:00:00+05:30");

export const checkAvailabilityArgs = z.object({
  doctor: z.string().min(1).describe("Doctor name or id"),
  date: isoDate,
});

export const bookAppointmentArgs = z.object({
  patient_name: z.string().min(1).max(100),
  phone: phoneE164,
  doctor: z.string().min(1),
  starts_at: instant,
  reason: z.string().max(500).optional(),
  language: z.enum(["te", "en", "hi"]).optional(),
});

export const rescheduleAppointmentArgs = z.object({
  phone: phoneE164,
  new_starts_at: instant,
  doctor: z.string().min(1).optional(),
  patient_name: z.string().min(1).max(100).optional(),
});

export const cancelAppointmentArgs = z.object({
  phone: phoneE164,
  patient_name: z.string().min(1).max(100).optional(),
  reason: z.string().max(500).optional(),
});

export const TOOL_ARG_SCHEMAS = {
  check_availability: checkAvailabilityArgs,
  book_appointment: bookAppointmentArgs,
  reschedule_appointment: rescheduleAppointmentArgs,
  cancel_appointment: cancelAppointmentArgs,
} as const;

export type ToolName = keyof typeof TOOL_ARG_SCHEMAS;
export const TOOL_NAMES = Object.keys(TOOL_ARG_SCHEMAS) as ToolName[];
