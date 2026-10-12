import type { Tone } from "@/components/ui";

/**
 * How a reschedule batch and each patient in it are described.
 *
 * The rule throughout: never describe a state as further along than it is.
 * Queued is not sent, sent is not delivered, and a patient who was told is not
 * a patient who was rebooked. A clinic acting on "delivered" when the message
 * never left would leave a patient turning up to a doctor who is not there.
 */

export type MessageLike = { status: string; error_code?: string | null } | null;

export function messageState(m: MessageLike): { label: string; tone: Tone; detail: string } {
  if (!m) return { label: "No message", tone: "neutral", detail: "Nothing was sent to this patient." };
  switch (m.status) {
    case "queued":
      return { label: "Queued", tone: "warn", detail: "Waiting to send — not sent yet." };
    case "sending":
      return { label: "Sending", tone: "info", detail: "Handed to WhatsApp — not confirmed yet." };
    case "sent":
      return { label: "Sent", tone: "info", detail: "Left SAHVA — not yet delivered to the phone." };
    case "delivered":
      return { label: "Delivered", tone: "good", detail: "Reached the patient's phone — not yet read." };
    case "read":
      return { label: "Read", tone: "good", detail: "The patient opened it." };
    case "failed":
    case "undelivered":
      return {
        label: "Failed",
        tone: "bad",
        detail: m.error_code ? `Did not reach the patient (${m.error_code}).` : "Did not reach the patient.",
      };
    default:
      return { label: m.status, tone: "neutral", detail: "" };
  }
}

export function itemStage(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return { label: "Not contacted", tone: "neutral" };
    case "notified":
      return { label: "Told — not rebooked", tone: "warn" };
    case "rebooked":
      return { label: "Rebooked", tone: "good" };
    case "unreachable":
      return { label: "Couldn't reach", tone: "bad" };
    case "cancelled":
      return { label: "Declined", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/** Still needs someone to act on it. Told-but-not-rebooked is still open. */
export const isOpenItem = (status: string) => status === "pending" || status === "notified";

/** Staff may record contact only once a named person has approved the batch. */
export const canContact = (batchStatus: string, itemStatus: string) =>
  batchStatus === "notifying" && isOpenItem(itemStatus);

export function progress(items: { status: string }[]): { handled: number; total: number } {
  return { handled: items.filter((i) => !isOpenItem(i.status)).length, total: items.length };
}

/** The four steps of the flow, and which one a batch is on (0-based). */
export const STEPS = ["Review", "Approve", "Contact patients", "Done"] as const;

export function currentStep(batchStatus: string): number {
  switch (batchStatus) {
    case "draft":
      return 0;
    case "notifying":
      return 2;
    case "completed":
      return 3;
    default:
      return 0;
  }
}
