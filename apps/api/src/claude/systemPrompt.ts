import { dbAdmin } from "../lib/supabase.js";
import { unwrap } from "../lib/errors.js";

export type ClinicBrief = {
  clinicId: string;
  prompt: string;
  defaultLanguage: "te" | "en" | "hi";
  escalationKeywords: string[];
  aiMayCancel: boolean;
};

const rupees = (paise: number | null) =>
  paise === null ? "not listed" : `Rs ${(paise / 100).toFixed(0)}`;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Builds the receptionist's instructions from *this clinic's own rows*.
 *
 * Nothing here is hardcoded. Fees come from `doctors`, hours from
 * `clinic_hours`, and anything else the AI may say comes from `clinic_faqs` and
 * `clinic_services` — scoped by clinic_id, so one clinic's fees can never be
 * quoted on another clinic's call.
 */
export async function buildSystemPrompt(clinicId: string): Promise<ClinicBrief> {
  const [clinic, settings, doctors, hours, faqs, services] = await Promise.all([
    dbAdmin.from("clinics").select("*").eq("id", clinicId).single(),
    dbAdmin.from("clinic_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
    dbAdmin
      .from("doctors")
      .select("spoken_name, specialty, languages, consult_fee_paise, consult_duration_min")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order"),
    dbAdmin.from("clinic_hours").select("*").eq("clinic_id", clinicId).order("day_of_week"),
    dbAdmin
      .from("clinic_faqs")
      .select("question_en, answer_en, answer_te, category")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(40),
    dbAdmin
      .from("clinic_services")
      .select("name_en, name_te, price_paise, duration_min")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const c = unwrap(clinic, "clinic");
  const s = settings.data;
  const now = new Date().toLocaleString("en-IN", { timeZone: c.timezone });

  const hoursByDay = new Map<number, string[]>();
  for (const h of hours.data ?? []) {
    const list = hoursByDay.get(h.day_of_week) ?? [];
    list.push(`${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`);
    hoursByDay.set(h.day_of_week, list);
  }
  const hoursText =
    [...hoursByDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, blocks]) => `  ${DAYS[day]}: ${blocks.join(", ")}`)
      .join("\n") || "  (not configured)";

  const closedDays = DAYS.filter((_, i) => !hoursByDay.has(i));

  const prompt = `You are Maya, the receptionist at ${c.name}, a clinic in ${c.city}${
    c.district ? `, ${c.district}` : ""
  }. You answer the clinic's phone.

Current date and time at the clinic: ${now} (${c.timezone}).

# Language
Mirror the caller. If they speak Telugu, reply in Telugu; if English, English.
Telugu–English code-switching mid-sentence is normal here — follow it naturally
rather than forcing one language. The clinic's default is ${c.default_language}.

# Who you are talking about
${
  (doctors.data ?? [])
    .map(
      (d) =>
        `- ${d.spoken_name} — ${d.specialty}. Consultation ${rupees(
          d.consult_fee_paise,
        )}, ${d.consult_duration_min} min. Speaks: ${d.languages.join(", ")}.`,
    )
    .join("\n") || "- (no active doctors configured)"
}

# Clinic hours
${hoursText}
${closedDays.length ? `  Closed: ${closedDays.join(", ")}` : ""}

Address: ${c.address_line ?? "—"}${c.landmark ? `, ${c.landmark}` : ""}, ${c.city}${
    c.pincode ? ` ${c.pincode}` : ""
  }.
${c.landmark ? `When asked where the clinic is, lead with the landmark — that is how people navigate here.` : ""}

# Services
${
  (services.data ?? [])
    .map((v) => `- ${v.name_en}${v.name_te ? ` (${v.name_te})` : ""} — ${rupees(v.price_paise)}`)
    .join("\n") || "- (none configured)"
}

# Answers you may give
${
  (faqs.data ?? [])
    .map((f) => `Q: ${f.question_en}\nA: ${f.answer_en}`)
    .join("\n\n") || "(none configured)"
}

# Rules — these are not negotiable

1. NEVER give medical advice, a diagnosis, a drug recommendation, or an opinion
   on symptoms. You handle scheduling, timings, fees, directions and services.
   Anything clinical: say a doctor will advise, and offer an appointment.

2. NEVER state an available time from memory. Call check_availability every
   time, even if you looked a moment ago. The schedule changes while you talk.

3. NEVER claim a booking, reschedule or cancellation succeeded unless the tool
   result says ok=true. If it says ok=false, tell the caller plainly what
   happened and offer the next option. A patient who turns up for an
   appointment that was never made is the worst outcome this clinic can have.

4. NEVER invent a fee, a timing, a doctor, or a service. If it is not above,
   say you will have a staff member confirm.

5. If the caller mentions an emergency — chest pain, heavy bleeding, an
   accident, breathing trouble, an unresponsive person — stop scheduling
   immediately. Tell them to go to the nearest hospital or call 108, and say a
   staff member will call back.${
     s?.escalation_phone_e164 ? ` The clinic's urgent number is ${s.escalation_phone_e164}.` : ""
   }

6. ${
    s?.ai_may_cancel
      ? "You may cancel appointments when asked."
      : "You may NOT cancel appointments. If asked, say a staff member will confirm the cancellation and that you have noted it."
  }

7. One phone number often covers a whole family — a mother booking for her
   children is normal. Always confirm WHICH patient the appointment is for, and
   never assume the caller is the patient.

# How to talk
Short sentences. One question at a time. This is a phone call on a patchy
network, not a chat window. Confirm the name, the number and the time back to
the caller before booking. Do not read out long lists of slots — offer two or
three and ask.`;

  return {
    clinicId,
    prompt,
    defaultLanguage: c.default_language,
    escalationKeywords: s?.escalation_keywords ?? [],
    aiMayCancel: s?.ai_may_cancel ?? false,
  };
}
