import { dbAdmin } from "./supabase.js";
import { badRequest } from "./errors.js";

type ApptForMessage = {
  starts_at: string;
  doctors: { spoken_name: string } | null;
  patients: { full_name: string; phone_e164: string; preferred_language: "te" | "en" | "hi" } | null;
  clinics: { name: string; phone_e164: string; timezone: string } | null;
};

export type RenderedMessage = {
  to: string;
  language: "te" | "en" | "hi";
  template_key: string;
  body: string;
};

type Candidate = { clinic_id: string | null; body: string; language: "te" | "en" | "hi" };

/**
 * Choose between the templates that matched.
 *
 * Clinic-first: a clinic's own row overrides the Sahva-provided default with
 * the same (key, channel, language). If the patient's language has no template
 * at all, fall back rather than sending nothing — a confirmation in the wrong
 * language still beats a patient who does not know they have an appointment.
 */
export function pickTemplate<T extends Candidate>(
  candidates: T[],
  language: "te" | "en" | "hi",
): T | undefined {
  return (
    candidates.find((t) => t.clinic_id !== null && t.language === language) ??
    candidates.find((t) => t.clinic_id === null && t.language === language) ??
    candidates.find((t) => t.clinic_id !== null) ??
    candidates.find((t) => t.clinic_id === null)
  );
}

/**
 * Substitute {{variables}}. An unknown placeholder is left intact rather than
 * silently blanked, so a broken template is visible in the preview instead of
 * reaching a patient as a gap in a sentence.
 */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

/**
 * Resolve a template and fill it.
 */
export async function renderTemplate(
  key: string,
  appt: ApptForMessage,
  channel: "whatsapp" | "sms" = "whatsapp",
): Promise<RenderedMessage> {
  const patient = appt.patients;
  const clinic = appt.clinics;
  if (!patient || !clinic) throw badRequest("INCOMPLETE_APPOINTMENT", "Appointment is missing its patient or clinic.");

  const language = patient.preferred_language;

  const { data } = await dbAdmin
    .from("message_templates")
    .select("clinic_id, body, language")
    .eq("key", key)
    .eq("channel", channel)
    .in("language", [language, "en"])
    .eq("is_active", true);

  const pick = pickTemplate(data ?? [], language);
  if (!pick) throw badRequest("TEMPLATE_NOT_FOUND", `No ${channel} template for "${key}".`);

  const when = new Date(appt.starts_at).toLocaleString("en-IN", {
    timeZone: clinic.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const vars: Record<string, string> = {
    patient_name: patient.full_name,
    doctor_name: appt.doctors?.spoken_name ?? "the doctor",
    clinic_name: clinic.name,
    clinic_phone: clinic.phone_e164,
    date_time: when,
  };

  return {
    to: patient.phone_e164,
    language: pick.language,
    template_key: key,
    body: fillTemplate(pick.body, vars),
  };
}
