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

/**
 * Resolve a template and fill it.
 *
 * Resolution is clinic-first: a clinic's own row overrides the Sahva-provided
 * default with the same (key, channel, language). Falls back to English if the
 * patient's language has no template yet.
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

  const candidates = data ?? [];
  const pick =
    candidates.find((t) => t.clinic_id !== null && t.language === language) ??
    candidates.find((t) => t.clinic_id === null && t.language === language) ??
    candidates.find((t) => t.clinic_id !== null) ??
    candidates.find((t) => t.clinic_id === null);

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

  const body = pick.body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);

  return { to: patient.phone_e164, language: pick.language, template_key: key, body };
}
