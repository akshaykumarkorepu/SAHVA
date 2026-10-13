import { dbAdmin } from "./supabase.js";
import { unwrap } from "./errors.js";

/**
 * A clinic's public face: contact details, doctors (speciality, languages,
 * fees, weekly timings), hours, upcoming closures, services and FAQs.
 * Shown to its own patients and on its public page. Nothing about any
 * patient, and no doctor's registration number or phone.
 */
export async function clinicProfile(clinicId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [clinic, doctors, sessions, hours, closures, services, faqs] = await Promise.all([
    dbAdmin
      .from("clinics")
      .select("id, slug, name, city, address_line, landmark, phone_e164, whatsapp_e164, map_url, timezone")
      .eq("id", clinicId)
      .single(),
    dbAdmin
      .from("doctors")
      .select("id, full_name, specialty, qualifications, languages, consult_fee_paise, followup_fee_paise, consult_duration_min, colour_hex")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order"),
    dbAdmin.from("doctor_sessions").select("doctor_id, day_of_week, starts_at, ends_at").eq("clinic_id", clinicId).order("starts_at"),
    dbAdmin.from("clinic_hours").select("day_of_week, opens_at, closes_at, label").eq("clinic_id", clinicId).order("day_of_week").order("opens_at"),
    dbAdmin.from("clinic_closures").select("starts_on, ends_on, reason").eq("clinic_id", clinicId).gte("ends_on", today).order("starts_on").limit(5),
    dbAdmin
      .from("clinic_services")
      .select("id, name_en, name_te, description, price_paise, duration_min")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order"),
    dbAdmin
      .from("clinic_faqs")
      .select("id, question_en, question_te, answer_en, answer_te")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(20),
  ]);
  const bySession = new Map<string, { day_of_week: number; starts_at: string; ends_at: string }[]>();
  for (const s of sessions.data ?? []) {
    const list = bySession.get(s.doctor_id) ?? [];
    list.push({ day_of_week: s.day_of_week, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at.slice(0, 5) });
    bySession.set(s.doctor_id, list);
  }
  return {
    clinic: unwrap(clinic, "clinic"),
    doctors: (doctors.data ?? []).map((d) => ({ ...d, sessions: bySession.get(d.id) ?? [] })),
    hours: (hours.data ?? []).map((h) => ({ ...h, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) })),
    // The same closure entered twice is shown once.
    closures: [...new Map((closures.data ?? []).map((c) => [`${c.starts_on}|${c.ends_on}|${c.reason}`, c])).values()],
    services: services.data ?? [],
    faqs: faqs.data ?? [],
  };
}
