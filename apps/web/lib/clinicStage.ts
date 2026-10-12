import type { Tone } from "@/components/ui";

/**
 * Where a clinic is, combining SAHVA's review with its subscription — the
 * one label an operator needs. Grace mirrors sahva.clinic_is_live(): three
 * days after a trial or paid period ends, patient-facing features stop.
 */
export type Stage = "pending" | "needs_info" | "trial" | "paying" | "grace" | "read_only" | "suspended" | "rejected" | "legacy";

export const STAGE: Record<Stage, { label: string; tone: Tone; hint: string }> = {
  pending: { label: "Awaiting review", tone: "info", hint: "Not live until approved" },
  needs_info: { label: "Needs info", tone: "warn", hint: "Waiting on the clinic" },
  trial: { label: "Trial", tone: "info", hint: "Free trial running" },
  paying: { label: "Paying", tone: "good", hint: "Paid period running" },
  grace: { label: "Grace", tone: "warn", hint: "Ended; patient features stop after 3 days" },
  read_only: { label: "Read-only", tone: "bad", hint: "Unpaid; nothing patient-facing runs" },
  suspended: { label: "Suspended", tone: "bad", hint: "Suspended by SAHVA" },
  rejected: { label: "Rejected", tone: "neutral", hint: "Application rejected" },
  legacy: { label: "Legacy", tone: "neutral", hint: "From before subscriptions" },
};

const GRACE_MS = 3 * 86_400_000;

export function clinicStage(
  c: { verification_status: string; subscription_status: string | null; current_period_end: string | null },
  now: Date = new Date(),
): Stage {
  if (c.verification_status === "submitted" || c.verification_status === "under_review") return "pending";
  if (c.verification_status === "needs_info") return "needs_info";
  if (c.verification_status === "rejected") return "rejected";
  if (c.verification_status === "suspended") return "suspended";
  if (!c.subscription_status || !c.current_period_end) return "legacy";
  const end = new Date(c.current_period_end).getTime();
  const t = now.getTime();
  if (end > t) return c.subscription_status === "active" ? "paying" : "trial";
  return end + GRACE_MS > t ? "grace" : "read_only";
}
