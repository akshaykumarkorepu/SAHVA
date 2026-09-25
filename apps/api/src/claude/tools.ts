import type Anthropic from "@anthropic-ai/sdk";

/**
 * The four actions the receptionist may take.
 *
 * Descriptions are written for the model, and say plainly that the backend can
 * refuse: the model must read the result rather than assume success.
 */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Look up genuinely free appointment slots for a doctor on a date. Always call this before " +
      "offering any time. Never state availability from memory or from earlier in the call — the " +
      "schedule changes while you talk.",
    input_schema: {
      type: "object",
      properties: {
        doctor: { type: "string", description: "Doctor's name as the caller said it." },
        date: { type: "string", description: "Date in YYYY-MM-DD (clinic local time)." },
      },
      required: ["doctor", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a slot that check_availability just returned. The backend re-checks availability and " +
      "will refuse if the slot has gone. If the result has ok=false, tell the caller honestly and " +
      "offer another time — never claim a booking succeeded.",
    input_schema: {
      type: "object",
      properties: {
        patient_name: { type: "string", description: "Patient's full name, as spoken." },
        phone: { type: "string", description: "Phone in E.164, e.g. +919885512345." },
        doctor: { type: "string" },
        starts_at: {
          type: "string",
          description: "Exact slot from check_availability, ISO-8601 with offset.",
        },
        reason: { type: "string", description: "Chief complaint, if given." },
        language: { type: "string", enum: ["te", "en", "hi"] },
      },
      required: ["patient_name", "phone", "doctor", "starts_at"],
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Move the caller's upcoming appointment. If several patients share the phone number, the " +
      "result asks which one — read the names back and ask.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "E.164." },
        new_starts_at: { type: "string", description: "New slot, ISO-8601 with offset." },
        doctor: { type: "string", description: "Only if changing doctor." },
        patient_name: { type: "string", description: "To disambiguate a shared number." },
      },
      required: ["phone", "new_starts_at"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the caller's upcoming appointment. Many clinics do not allow this — if the result " +
      "is ok=false, say a staff member will confirm, and do not retry.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "E.164." },
        patient_name: { type: "string", description: "To disambiguate a shared number." },
        reason: { type: "string" },
      },
      required: ["phone"],
    },
  },
];
