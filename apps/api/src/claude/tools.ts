import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

/**
 * Tools exposed to the model. Names + schemas must stay in lockstep with
 * the implementations in src/tools/appointments.ts.
 */
export const TOOL_DEFS: Tool[] = [
  {
    name: "check_availability",
    description:
      "Return free 15-minute appointment slots for a given doctor on a given date. " +
      "Use this before suggesting any time to the patient. " +
      "Pass `doctor` as the doctor's full name (e.g. 'Dr. Anitha Reddy') or numeric id as a string. " +
      "Pass `date` as YYYY-MM-DD in Asia/Kolkata.",
    input_schema: {
      type: "object",
      properties: {
        doctor: {
          type: "string",
          description:
            "Doctor name (e.g. 'Dr. Anitha Reddy') or numeric id. Names are matched case-insensitively.",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD (Asia/Kolkata).",
        },
      },
      required: ["doctor", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment. If the patient does not exist by phone, a new patient record is created. " +
      "Always confirm with the patient before calling this.",
    input_schema: {
      type: "object",
      properties: {
        patient_name: { type: "string" },
        phone: { type: "string", description: "10-digit phone, digits only preferred." },
        doctor: { type: "string", description: "Doctor name or id." },
        starts_at: { type: "string", description: "ISO8601 timestamp in Asia/Kolkata." },
        reason: { type: "string", description: "Optional chief complaint / reason." },
      },
      required: ["patient_name", "phone", "doctor", "starts_at"],
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedule the patient's next booked appointment to a new time, optionally with a different doctor. " +
      "Always confirm before calling this.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        new_starts_at: { type: "string", description: "ISO8601." },
        doctor: { type: "string", description: "Optional new doctor name or id." },
      },
      required: ["phone", "new_starts_at"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the patient's next booked appointment. Always confirm with the patient first.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
      },
      required: ["phone"],
    },
  },
];
