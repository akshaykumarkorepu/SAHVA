import type { Enums } from "@sahva/types";

type ActionType = Enums<"action_type">;

/**
 * What each kind of Action Required item means for the person reading it.
 *
 * Keyed by the enum, so a new action type fails the build until someone has
 * written down why it needs a person and what they should do.
 */

export type ActionCategory = "appointments" | "messages" | "ai";

export const CATEGORY_LABEL: Record<ActionCategory, string> = {
  appointments: "Appointments",
  messages: "Patient messages",
  ai: "AI quality",
};

export const ACTION_GUIDE: Record<
  ActionType,
  { category: ActionCategory; why: string; next: string; closesItself?: boolean }
> = {
  reschedule_needed: {
    category: "appointments",
    why: "A doctor became unavailable. SAHVA does not move patients without a person deciding.",
    next: "Review the patients, approve, then call and rebook each one.",
    // Resolved by the database when the last patient is handled.
    closesItself: true,
  },
  booking_conflict: {
    category: "appointments",
    why: "The AI tried to book during a call and the diary refused it.",
    next: "Open the call, then book the caller yourself if they still need a time.",
  },
  online_request: {
    category: "appointments",
    why: "Someone new requested this slot on your public page. Their number is not verified, so the slot is only held.",
    next: "Call them. If they are real, Confirm the appointment; if not, cancel it. Unconfirmed requests are released after 24 hours.",
    // Confirming or cancelling the appointment closes it.
    closesItself: true,
  },
  failed_message: {
    category: "messages",
    why: "A message to the patient did not reach them, so they may not know their time.",
    next: "Call the patient to confirm their appointment.",
  },
  missed_call_followup: {
    category: "messages",
    why: "The call ended before the caller's request was finished.",
    next: "Call them back.",
  },
  ai_escalation: {
    category: "ai",
    why: "The AI handed the call to a person — a medical question, or a caller who asked for staff.",
    next: "Open the call, read what was asked, and call the patient back.",
  },
  low_confidence_call: {
    category: "ai",
    why: "Speech recognition was unsure during a booking, so the details may be wrong.",
    next: "Open the call and check the name, date and time against the transcript.",
  },
  unrecognised_caller: {
    category: "ai",
    why: "The AI could not confirm who was calling.",
    next: "Open the call and match the caller to a patient, or add them.",
  },
};

export function countByCategory(items: { type: ActionType | null }[]): Record<ActionCategory, number> {
  const out: Record<ActionCategory, number> = { appointments: 0, messages: 0, ai: 0 };
  for (const i of items) if (i.type) out[ACTION_GUIDE[i.type].category] += 1;
  return out;
}
