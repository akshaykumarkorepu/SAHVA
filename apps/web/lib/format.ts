import type { Enums } from "@sahva/types";
import type { Tone } from "@/components/ui";

/**
 * Clinic-local formatting. The timezone is passed in from the clinic record
 * rather than assumed — a second clinic in a different zone must not silently
 * render in the first one's time.
 */
const DEFAULT_TZ = "Asia/Kolkata";

export function formatDateTime(iso: string, tz = DEFAULT_TZ): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function formatTime(iso: string, tz = DEFAULT_TZ): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function formatDate(iso: string, tz = DEFAULT_TZ): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
}

/** Today as YYYY-MM-DD in the clinic's timezone, not the browser's. */
export function todayIso(tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "in 2 hours" / "3 days ago" — the queue reads better in relative terms. */
export function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return "just now";
}

/** +919885512345 → +91 98855 12345 */
export function formatPhone(p: string | null): string {
  if (!p) return "—";
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

/** Paise are stored as integers; never do money maths in floats. */
export function rupees(paise: number | null): string {
  if (paise === null || paise === undefined) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export const LANGUAGE_LABEL: Record<Enums<"language_code">, string> = {
  te: "Telugu",
  en: "English",
  hi: "Hindi",
};

export function appointmentStatus(s: Enums<"appointment_status">): { label: string; tone: Tone } {
  switch (s) {
    case "booked":
      return { label: "Booked", tone: "info" };
    case "confirmed":
      return { label: "Confirmed", tone: "good" };
    case "checked_in":
      return { label: "Checked in", tone: "good" };
    case "completed":
      return { label: "Completed", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "bad" };
    case "no_show":
      return { label: "No show", tone: "warn" };
    case "needs_reschedule":
      return { label: "Needs reschedule", tone: "bad" };
  }
}

export function callOutcome(o: Enums<"call_outcome"> | null): { label: string; tone: Tone } {
  switch (o) {
    case "booked":
      return { label: "Booked", tone: "good" };
    case "rescheduled":
      return { label: "Rescheduled", tone: "info" };
    case "cancelled":
      return { label: "Cancelled", tone: "bad" };
    case "faq_answered":
      return { label: "Question answered", tone: "neutral" };
    case "escalated":
      return { label: "Escalated", tone: "warn" };
    case "unresolved":
      return { label: "Unresolved", tone: "warn" };
    case "no_action":
      return { label: "No action", tone: "neutral" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

export function actionSeverity(s: Enums<"action_severity">): { label: string; tone: Tone } {
  switch (s) {
    case "urgent":
      return { label: "Urgent", tone: "bad" };
    case "high":
      return { label: "High", tone: "warn" };
    case "normal":
      return { label: "Normal", tone: "info" };
    case "low":
      return { label: "Low", tone: "neutral" };
  }
}

export const ACTION_TYPE_LABEL: Record<Enums<"action_type">, string> = {
  reschedule_needed: "Reschedule needed",
  unrecognised_caller: "Unrecognised caller",
  ai_escalation: "Escalated by AI",
  low_confidence_call: "Verify booking",
  failed_message: "Message failed",
  booking_conflict: "Booking refused",
  missed_call_followup: "Unresolved call",
};
