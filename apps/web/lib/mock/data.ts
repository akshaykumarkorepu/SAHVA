/**
 * Mock data for `NEXT_PUBLIC_MOCK=1`.
 *
 * Mirrors supabase/seed.sql — Sri Sai Clinic, Warangal — so the dashboard shows
 * the same clinic a real seeded database would, including the Action Required
 * flow the seed deliberately triggers (Dr Anitha pulled to the district
 * hospital tomorrow morning).
 *
 * Shapes follow what the API returns, not the raw tables: the joins the routes
 * perform are baked in. See apps/web/lib/types.ts.
 */

const IST = "Asia/Kolkata";

/**
 * Today in the clinic's timezone, as a plain YYYY-MM-DD.
 *
 * All date arithmetic below stays on this string and never round-trips through
 * a Date's local/UTC calendar: IST is +05:30, so midnight IST is the *previous*
 * day in UTC, and `toISOString().slice(0,10)` on such a Date silently shifts
 * everything a day earlier.
 */
const TODAY_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

/** Calendar-date arithmetic in whole UTC days — no offset, no DST. */
function ymdPlus(days: number): string {
  const [y, m, d] = TODAY_YMD.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

function at(dayOffset: number, hhmm: string): string {
  return new Date(`${ymdPlus(dayOffset)}T${hhmm}:00+05:30`).toISOString();
}

function dateOnly(dayOffset: number): string {
  return ymdPlus(dayOffset);
}

/** The seed places appointments on the next non-Sunday, so mirror that. */
const NEXT_WORKDAY = (() => {
  for (let n = 1; ; n += 1) {
    const [y, m, d] = ymdPlus(n).split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) return n;
  }
})();

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ANITHA = "22222222-2222-4222-8222-222222222201";
const DOC_RAMESH = "22222222-2222-4222-8222-222222222202";
const DOC_KAVITHA = "22222222-2222-4222-8222-222222222203";
const PT_LAKSHMI = "33333333-3333-4333-8333-333333333301";
const PT_AARAV = "33333333-3333-4333-8333-333333333302";
const PT_SRINIVAS = "33333333-3333-4333-8333-333333333303";
const PT_PRIYA = "33333333-3333-4333-8333-333333333304";
const PT_MOHAN = "33333333-3333-4333-8333-333333333305";
const BATCH_ID = "44444444-4444-4444-8444-444444444401";
const STAFF_OWNER = "55555555-5555-4555-8555-555555555501";
const STAFF_RECEPTION = "55555555-5555-4555-8555-555555555502";

export const clinic = {
  id: CLINIC_ID,
  slug: "sri-sai-warangal",
  name: "Sri Sai Clinic",
  legal_name: "Sri Sai Poly Clinic",
  phone_e164: "+918702345678",
  whatsapp_e164: "+918702345678",
  support_email: "frontdesk@srisaiclinic.in",
  address_line: "2-4-118, Station Road",
  landmark: "Opposite Hanamkonda bus stand",
  city: "Warangal",
  district: "Hanamkonda",
  state: "Telangana",
  pincode: "506001",
  timezone: IST,
  default_language: "te",
  supported_languages: ["te", "en"],
  map_url: null,
  onboarded_at: at(-40, "09:00"),
  settings: {
    clinic_id: CLINIC_ID,
    ai_enabled: true,
    ai_may_cancel: false,
    greeting_te: "నమస్తే, శ్రీ సాయి క్లినిక్‌కి స్వాగతం. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?",
    greeting_en: "Namaste, welcome to Sri Sai Clinic. This is Maya. How may I help you?",
    escalation_phone_e164: "+919849012345",
    min_notice_minutes: 30,
    booking_horizon_days: 30,
  },
};

export const me = {
  user_id: STAFF_OWNER,
  email: "owner@srisaiclinic.in",
  clinic_id: CLINIC_ID,
  role: "owner",
};

export const doctors = [
  {
    id: DOC_ANITHA,
    clinic_id: CLINIC_ID,
    full_name: "Dr. Anitha Reddy",
    spoken_name: "Dr Anitha",
    specialty: "General Physician",
    qualifications: "MBBS, MD",
    languages: ["te", "en"],
    consult_duration_min: 15,
    consult_fee_paise: 30000,
    followup_fee_paise: 15000,
    colour_hex: "#2F6BFF",
    sort_order: 1,
    is_active: true,
  },
  {
    id: DOC_RAMESH,
    clinic_id: CLINIC_ID,
    full_name: "Dr. Ramesh Babu",
    spoken_name: "Dr Ramesh",
    specialty: "Paediatrician",
    qualifications: "MBBS, DCH",
    languages: ["te", "en", "hi"],
    consult_duration_min: 20,
    consult_fee_paise: 35000,
    followup_fee_paise: 20000,
    colour_hex: "#12B886",
    sort_order: 2,
    is_active: true,
  },
  {
    id: DOC_KAVITHA,
    clinic_id: CLINIC_ID,
    full_name: "Dr. Kavitha Rao",
    spoken_name: "Dr Kavitha",
    specialty: "Dentist",
    qualifications: "BDS, MDS",
    languages: ["te", "en"],
    consult_duration_min: 30,
    consult_fee_paise: 40000,
    followup_fee_paise: 25000,
    colour_hex: "#F08C00",
    sort_order: 3,
    is_active: true,
  },
];

export const patients = [
  {
    id: PT_LAKSHMI,
    clinic_id: CLINIC_ID,
    full_name: "Lakshmi Devi",
    phone_e164: "+919885512345",
    approx_age_years: 34,
    date_of_birth: null,
    sex: "female",
    preferred_language: "te",
    first_seen_via: "ai_call",
    created_at: at(-38, "11:20"),
  },
  {
    id: PT_AARAV,
    clinic_id: CLINIC_ID,
    full_name: "Aarav",
    phone_e164: "+919885512345",
    approx_age_years: 3,
    date_of_birth: null,
    sex: "male",
    preferred_language: "te",
    first_seen_via: "ai_call",
    created_at: at(-38, "11:22"),
  },
  {
    id: PT_SRINIVAS,
    clinic_id: CLINIC_ID,
    full_name: "Srinivas Rao",
    phone_e164: "+919701123456",
    approx_age_years: 52,
    date_of_birth: null,
    sex: "male",
    preferred_language: "te",
    first_seen_via: "ai_call",
    created_at: at(-31, "09:40"),
  },
  {
    id: PT_PRIYA,
    clinic_id: CLINIC_ID,
    full_name: "Priya Sharma",
    phone_e164: "+919642233445",
    approx_age_years: 28,
    date_of_birth: null,
    sex: "female",
    preferred_language: "en",
    first_seen_via: "walk_in",
    created_at: at(-24, "18:05"),
  },
  {
    id: PT_MOHAN,
    clinic_id: CLINIC_ID,
    full_name: "Mohan Kumar",
    phone_e164: "+919391556677",
    approx_age_years: 41,
    date_of_birth: null,
    sex: "male",
    preferred_language: "te",
    first_seen_via: "ai_call",
    created_at: at(-12, "10:10"),
  },
];

const doctorBrief = (id: string) => {
  const d = doctors.find((x) => x.id === id)!;
  return { id: d.id, spoken_name: d.spoken_name, specialty: d.specialty, colour_hex: d.colour_hex };
};
const patientBrief = (id: string) => {
  const p = patients.find((x) => x.id === id)!;
  return {
    id: p.id,
    full_name: p.full_name,
    phone_e164: p.phone_e164,
    preferred_language: p.preferred_language,
  };
};

/**
 * Srinivas and Priya fall inside Dr Anitha's leave (doctorTimeOff below), so —
 * as the sweep_time_off trigger does — they are needs_reschedule, not booked.
 */
export const appointments = [
  {
    id: "66666666-6666-4666-8666-666666666601",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_ANITHA,
    patient_id: PT_SRINIVAS,
    starts_at: at(NEXT_WORKDAY, "10:00"),
    ends_at: at(NEXT_WORKDAY, "10:15"),
    duration_min: 15,
    status: "needs_reschedule",
    source: "ai_call",
    reason: "BP follow-up",
    token_number: 4,
    doctors: doctorBrief(DOC_ANITHA),
    patients: patientBrief(PT_SRINIVAS),
  },
  {
    id: "66666666-6666-4666-8666-666666666602",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_ANITHA,
    patient_id: PT_PRIYA,
    starts_at: at(NEXT_WORKDAY, "10:30"),
    ends_at: at(NEXT_WORKDAY, "10:45"),
    duration_min: 15,
    status: "needs_reschedule",
    source: "ai_call",
    reason: "Fever and cold",
    token_number: 5,
    doctors: doctorBrief(DOC_ANITHA),
    patients: patientBrief(PT_PRIYA),
  },
  {
    id: "66666666-6666-4666-8666-666666666603",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_RAMESH,
    patient_id: PT_AARAV,
    starts_at: at(NEXT_WORKDAY, "10:00"),
    ends_at: at(NEXT_WORKDAY, "10:20"),
    duration_min: 20,
    status: "booked",
    source: "ai_call",
    reason: "Pentavalent dose 2",
    token_number: 2,
    doctors: doctorBrief(DOC_RAMESH),
    patients: patientBrief(PT_AARAV),
  },
  {
    id: "66666666-6666-4666-8666-666666666604",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_RAMESH,
    patient_id: PT_MOHAN,
    starts_at: at(NEXT_WORKDAY, "11:00"),
    ends_at: at(NEXT_WORKDAY, "11:20"),
    duration_min: 20,
    status: "confirmed",
    source: "walk_in",
    reason: "Child cough",
    token_number: 3,
    doctors: doctorBrief(DOC_RAMESH),
    patients: patientBrief(PT_MOHAN),
  },
];

/** v_todays_appointments — today, so the home screen is never empty. */
export const todaysAppointments = [
  {
    id: "66666666-6666-4666-8666-666666666611",
    clinic_id: CLINIC_ID,
    starts_at: at(0, "09:30"),
    ends_at: at(0, "09:45"),
    status: "completed",
    source: "ai_call",
    reason: "BP follow-up",
    token_number: 1,
    local_time: "09:30:00",
    doctor_id: DOC_ANITHA,
    doctor_name: "Dr Anitha",
    colour_hex: "#2F6BFF",
    patient_id: PT_LAKSHMI,
    patient_name: "Lakshmi Devi",
    phone_e164: "+919885512345",
    preferred_language: "te",
  },
  {
    id: "66666666-6666-4666-8666-666666666612",
    clinic_id: CLINIC_ID,
    starts_at: at(0, "11:15"),
    ends_at: at(0, "11:35"),
    status: "checked_in",
    source: "ai_call",
    reason: "Vaccination — Pentavalent 1",
    token_number: 2,
    local_time: "11:15:00",
    doctor_id: DOC_RAMESH,
    doctor_name: "Dr Ramesh",
    colour_hex: "#12B886",
    patient_id: PT_AARAV,
    patient_name: "Aarav",
    phone_e164: "+919885512345",
    preferred_language: "te",
  },
  {
    id: "66666666-6666-4666-8666-666666666613",
    clinic_id: CLINIC_ID,
    starts_at: at(0, "17:30"),
    ends_at: at(0, "18:00"),
    status: "booked",
    source: "ai_call",
    reason: "Dental scaling",
    token_number: 3,
    local_time: "17:30:00",
    doctor_id: DOC_KAVITHA,
    doctor_name: "Dr Kavitha",
    colour_hex: "#F08C00",
    patient_id: PT_PRIYA,
    patient_name: "Priya Sharma",
    phone_e164: "+919642233445",
    preferred_language: "en",
  },
];

/**
 * The Action Required queue.
 *
 * The first item is the seed's trust-flow demonstration: Dr Anitha is pulled
 * away tomorrow morning, two patients are affected, and the batch sits in DRAFT
 * — nothing cancelled, nobody messaged, until a human presses send.
 */
export const actionItems = [
  {
    id: "77777777-7777-4777-8777-777777777701",
    clinic_id: CLINIC_ID,
    type: "reschedule_needed",
    severity: "urgent",
    status: "open",
    title: "Dr Anitha is unavailable tomorrow morning",
    description:
      "Called to the district hospital, 9:00 AM – 1:00 PM. 2 appointments are affected. Nothing has been cancelled and no patient has been messaged.",
    due_by: at(0, "20:00"),
    created_at: at(0, "08:12"),
    assigned_to: null,
    related_appointment_id: null,
    related_call_id: null,
    related_batch_id: BATCH_ID,
    doctor_name: "Dr Anitha",
    patient_name: null,
    patient_phone: null,
    total_affected: 2,
    notified_count: 0,
    rebooked_count: 0,
    batch_status: "draft",
    is_overdue: false,
  },
  {
    id: "77777777-7777-4777-8777-777777777702",
    clinic_id: CLINIC_ID,
    type: "low_confidence_call",
    severity: "high",
    status: "open",
    title: "Booking made from poorly-heard speech",
    description:
      "Speech confidence averaged 0.61 on this call. The name was recorded as \"Mohan Kumar\" and the number may be wrong — worth a confirmation call before the appointment.",
    due_by: at(1, "12:00"),
    created_at: at(0, "09:47"),
    assigned_to: null,
    related_appointment_id: "66666666-6666-4666-8666-666666666604",
    related_call_id: "88888888-8888-4888-8888-888888888801",
    related_batch_id: null,
    doctor_name: "Dr Ramesh",
    patient_name: "Mohan Kumar",
    patient_phone: "+919391556677",
    total_affected: null,
    notified_count: null,
    rebooked_count: null,
    batch_status: null,
    is_overdue: false,
  },
  {
    id: "77777777-7777-4777-8777-777777777703",
    clinic_id: CLINIC_ID,
    type: "failed_message",
    severity: "normal",
    status: "open",
    title: "WhatsApp confirmation did not reach Priya Sharma",
    description:
      "The confirmation for tomorrow 10:30 AM bounced. The appointment stands — the patient just has not been told.",
    due_by: null,
    created_at: at(-1, "19:02"),
    assigned_to: null,
    related_appointment_id: "66666666-6666-4666-8666-666666666602",
    related_call_id: null,
    related_batch_id: null,
    doctor_name: "Dr Anitha",
    patient_name: "Priya Sharma",
    patient_phone: "+919642233445",
    total_affected: null,
    notified_count: null,
    rebooked_count: null,
    batch_status: null,
    is_overdue: false,
  },
];

/**
 * Same columns as public.reschedule_batch_items plus the API's embeds.
 * Widened (string status) where the mock mutates it.
 */
export type RescheduleBatchItem = {
  id: string;
  batch_id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  status: string;
  new_appointment_id: string | null;
  message_id: string | null;
  attempts: number;
  last_error: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  patients: ReturnType<typeof patientBrief>;
  appointments: { id: string; starts_at: string; status: string };
  new_appointment: { id: string; starts_at: string } | null;
  message: { status: string; sent_at: string | null; delivered_at: string | null; failed_at: string | null; error_code: string | null } | null;
};

export type RescheduleBatch = {
  id: string;
  clinic_id: string;
  doctor_id: string;
  time_off_id: string | null;
  status: string;
  reason_note: string | null;
  window_start: string;
  window_end: string;
  total_affected: number;
  notified_count: number;
  rebooked_count: number;
  created_by: string | null;
  dispatched_by: string | null;
  dispatched_at: string | null;
  created_at: string;
  updated_at: string;
  doctors: { spoken_name: string; specialty: string };
  items: RescheduleBatchItem[];
};

export const rescheduleBatch: RescheduleBatch = {
  id: BATCH_ID,
  clinic_id: CLINIC_ID,
  doctor_id: DOC_ANITHA,
  time_off_id: "ff000000-0000-4000-8000-000000000001",
  status: "draft",
  reason_note: "Called to district hospital",
  window_start: at(NEXT_WORKDAY, "09:00"),
  window_end: at(NEXT_WORKDAY, "13:00"),
  total_affected: 2,
  notified_count: 0,
  rebooked_count: 0,
  created_by: null,
  dispatched_by: null,
  dispatched_at: null,
  created_at: at(0, "08:12"),
  updated_at: at(0, "08:12"),
  doctors: { spoken_name: "Dr Anitha", specialty: "General Physician" },
  items: [
    {
      id: "99999999-9999-4999-8999-999999999901",
      batch_id: BATCH_ID,
      clinic_id: CLINIC_ID,
      appointment_id: "66666666-6666-4666-8666-666666666601",
      patient_id: PT_SRINIVAS,
      status: "pending",
      new_appointment_id: null,
      message_id: null,
      attempts: 0,
      last_error: null,
      resolved_at: null,
      created_at: at(0, "08:12"),
      updated_at: at(0, "08:12"),
      new_appointment: null,
      message: null,
      patients: patientBrief(PT_SRINIVAS),
      appointments: {
        id: "66666666-6666-4666-8666-666666666601",
        starts_at: at(NEXT_WORKDAY, "10:00"),
        status: "needs_reschedule",
      },
    },
    {
      id: "99999999-9999-4999-8999-999999999902",
      batch_id: BATCH_ID,
      clinic_id: CLINIC_ID,
      appointment_id: "66666666-6666-4666-8666-666666666602",
      patient_id: PT_PRIYA,
      status: "pending",
      new_appointment_id: null,
      message_id: null,
      attempts: 0,
      last_error: null,
      resolved_at: null,
      created_at: at(0, "08:12"),
      updated_at: at(0, "08:12"),
      new_appointment: null,
      message: null,
      patients: patientBrief(PT_PRIYA),
      appointments: {
        id: "66666666-6666-4666-8666-666666666602",
        starts_at: at(NEXT_WORKDAY, "10:30"),
        status: "needs_reschedule",
      },
    },
  ],
};

/** 30 days of calls, same weighting as the seed. */
export const calls = (() => {
  const outcomes = ["booked", "booked", "faq_answered", "rescheduled", "no_action"];
  const intents = ["book", "book", "faq", "reschedule", "other"];
  const langs = ["te", "te", "te", "en"];
  const rows: Record<string, unknown>[] = [];
  for (let d = 0; d < 30; d += 1) {
    const perDay = 4 + (d % 3);
    for (let g = 1; g <= perDay; g += 1) {
      const idx = (d + g) % 5;
      const startMin = 9 * 60 + g * 47;
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      rows.push({
        id: `88888888-8888-4888-8888-8888888888${String(d).padStart(2, "0")}${g}`,
        clinic_id: CLINIC_ID,
        provider: "exotel",
        provider_call_sid: `seed-${d}-${g}`,
        direction: "inbound",
        from_e164: `+9198${String((d * 7 + g * 13) % 100000000).padStart(8, "0")}`,
        to_e164: "+918702345678",
        started_at: at(-d, `${hh}:${mm}`),
        answered_at: at(-d, `${hh}:${mm}`),
        ended_at: at(-d, `${hh}:${mm}`),
        duration_sec: 108,
        status: "completed",
        outcome: outcomes[idx],
        intent: intents[idx],
        primary_language: langs[(d + g) % 4],
        languages_detected: ["te", "en"],
        stt_confidence_avg: 0.72 + ((d + g) % 20) / 100,
        recovered_missed: (d + g) % 3 === 0,
        patients: idx < 2 ? { id: PT_SRINIVAS, full_name: "Srinivas Rao" } : null,
        call_summaries:
          idx < 2
            ? { summary_en: "Caller asked for a morning slot with Dr Anitha. Booked for 10:00 AM." }
            : { summary_en: "Caller asked about consultation fees. Answered from the clinic FAQ." },
      });
    }
  }
  return rows;
})();

/** One fully-populated call, so the detail drawer has a real transcript. */
export const callDetail = {
  ...(calls[0] as Record<string, unknown>),
  id: "88888888-8888-4888-8888-888888888801",
  stt_confidence_avg: 0.61,
  patients: { id: PT_MOHAN, full_name: "Mohan Kumar", phone_e164: "+919391556677" },
  summary: {
    call_id: "88888888-8888-4888-8888-888888888801",
    clinic_id: CLINIC_ID,
    summary_en:
      "Caller wanted a paediatric appointment for a child with a cough. Booked with Dr Ramesh for 11:00 AM. Speech confidence was low throughout.",
    follow_up_needed: true,
  },
  turns: [
    {
      id: "aa000000-0000-4000-8000-000000000001",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_index: 1,
      role: "assistant",
      content: "నమస్తే, శ్రీ సాయి క్లినిక్. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?",
      language: "te",
      stt_confidence: null,
      created_at: at(0, "09:45"),
    },
    {
      id: "aa000000-0000-4000-8000-000000000002",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_index: 2,
      role: "caller",
      content: "మా అబ్బాయికి దగ్గు ఉంది, డాక్టర్ రమేష్ గారిని కలవాలి",
      language: "te",
      stt_confidence: 0.58,
      created_at: at(0, "09:45"),
    },
    {
      id: "aa000000-0000-4000-8000-000000000003",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_index: 3,
      role: "assistant",
      content: "రేపు ఉదయం 11:00కి ఖాళీ ఉంది. మీ పేరు చెప్పగలరా?",
      language: "te",
      stt_confidence: null,
      created_at: at(0, "09:46"),
    },
    {
      id: "aa000000-0000-4000-8000-000000000004",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_index: 4,
      role: "caller",
      content: "Mohan Kumar, 98765 43210",
      language: "en",
      stt_confidence: 0.61,
      created_at: at(0, "09:46"),
    },
  ],
  tool_invocations: [
    {
      id: "bb000000-0000-4000-8000-000000000001",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_id: null,
      tool_name: "check_availability",
      arguments: { doctor: "Dr Ramesh", date: dateOnly(NEXT_WORKDAY) },
      allowed: true,
      denial_reason: null,
      result: { slots: 3 },
      latency_ms: 142,
      created_at: at(0, "09:46"),
    },
    {
      id: "bb000000-0000-4000-8000-000000000002",
      call_id: "88888888-8888-4888-8888-888888888801",
      clinic_id: CLINIC_ID,
      turn_id: null,
      tool_name: "book_appointment",
      arguments: { doctor: "Dr Ramesh", starts_at: at(NEXT_WORKDAY, "11:00") },
      allowed: true,
      denial_reason: null,
      result: { appointment_id: "66666666-6666-4666-8666-666666666604" },
      latency_ms: 268,
      created_at: at(0, "09:47"),
    },
  ],
};

export const clinicHours = (() => {
  const rows: Record<string, unknown>[] = [];
  for (let d = 1; d <= 6; d += 1) {
    rows.push({
      id: `cc000000-0000-4000-8000-0000000000${d}1`,
      clinic_id: CLINIC_ID,
      day_of_week: d,
      opens_at: "09:00",
      closes_at: "13:00",
      label: "Morning",
    });
    rows.push({
      id: `cc000000-0000-4000-8000-0000000000${d}2`,
      clinic_id: CLINIC_ID,
      day_of_week: d,
      opens_at: "17:00",
      closes_at: "20:00",
      label: "Evening",
    });
  }
  return rows;
})();

export const clinicClosures = [
  {
    id: "dd000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    starts_on: dateOnly(45),
    ends_on: dateOnly(46),
    reason: "Sankranti holiday",
  },
];

export const doctorSessions = [
  {
    id: "ee000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_ANITHA,
    day_of_week: 1,
    starts_at: "09:00",
    ends_at: "13:00",
    label: "Morning",
    effective_from: dateOnly(-40),
    effective_to: null,
  },
  {
    id: "ee000000-0000-4000-8000-000000000002",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_ANITHA,
    day_of_week: 1,
    starts_at: "17:00",
    ends_at: "20:00",
    label: "Evening",
    effective_from: dateOnly(-40),
    effective_to: null,
  },
];

export const doctorTimeOff = [
  {
    id: "ff000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    doctor_id: DOC_ANITHA,
    starts_at: at(NEXT_WORKDAY, "09:00"),
    ends_at: at(NEXT_WORKDAY, "13:00"),
    kind: "emergency",
    reason: "Called to district hospital",
    doctors: { spoken_name: "Dr Anitha" },
  },
];

export const services = [
  {
    id: "01000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    name_en: "General consultation",
    name_te: "సాధారణ సంప్రదింపు",
    price_paise: 30000,
    duration_min: 15,
    category: "consultation",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "01000000-0000-4000-8000-000000000002",
    clinic_id: CLINIC_ID,
    name_en: "Child vaccination",
    name_te: "పిల్లల టీకా",
    price_paise: 60000,
    duration_min: 20,
    category: "paediatrics",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "01000000-0000-4000-8000-000000000003",
    clinic_id: CLINIC_ID,
    name_en: "Dental scaling",
    name_te: "దంత శుభ్రపరచడం",
    price_paise: 150000,
    duration_min: 45,
    category: "dental",
    sort_order: 3,
    is_active: true,
  },
  {
    id: "01000000-0000-4000-8000-000000000004",
    clinic_id: CLINIC_ID,
    name_en: "Blood pressure check",
    name_te: "రక్తపోటు తనిఖీ",
    price_paise: 10000,
    duration_min: 10,
    category: "diagnostics",
    sort_order: 4,
    is_active: true,
  },
];

export const faqs = [
  {
    id: "02000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    question_en: "What are the consultation fees?",
    question_te: "సంప్రదింపు ఫీజు ఎంత?",
    answer_en:
      "General consultation is Rs 300. Paediatric consultation is Rs 350. Dental consultation is Rs 400.",
    answer_te: "సాధారణ సంప్రదింపు రూ.300. పిల్లల వైద్యం రూ.350. దంత వైద్యం రూ.400.",
    category: "fees",
    keywords: ["fee", "fees", "charge", "cost", "ఫీజు", "ఖర్చు"],
    priority: 10,
    is_active: true,
  },
  {
    id: "02000000-0000-4000-8000-000000000002",
    clinic_id: CLINIC_ID,
    question_en: "What are your timings?",
    question_te: "మీ సమయాలు ఏమిటి?",
    answer_en:
      "We are open Monday to Saturday, 9 AM to 1 PM and 5 PM to 8 PM. Closed on Sunday.",
    answer_te:
      "సోమవారం నుండి శనివారం వరకు ఉదయం 9 నుండి 1 వరకు, సాయంత్రం 5 నుండి 8 వరకు. ఆదివారం సెలవు.",
    category: "timings",
    keywords: ["timing", "hours", "open", "close", "సమయం", "తెరిచి"],
    priority: 9,
    is_active: true,
  },
  {
    id: "02000000-0000-4000-8000-000000000003",
    clinic_id: CLINIC_ID,
    question_en: "Where are you located?",
    question_te: "మీరు ఎక్కడ ఉన్నారు?",
    answer_en:
      "We are at 2-4-118 Station Road, opposite the Hanamkonda bus stand, Warangal.",
    answer_te: "హనుమకొండ బస్ స్టాండ్ ఎదురుగా, స్టేషన్ రోడ్, వరంగల్.",
    category: "location",
    keywords: ["where", "address", "location", "ఎక్కడ", "చిరునామా"],
    priority: 8,
    is_active: true,
  },
  {
    id: "02000000-0000-4000-8000-000000000004",
    clinic_id: CLINIC_ID,
    question_en: "Do I need an appointment?",
    question_te: "అపాయింట్‌మెంట్ అవసరమా?",
    answer_en:
      "Walk-ins are welcome but an appointment avoids waiting. I can book one for you now.",
    answer_te:
      "నేరుగా రావచ్చు, కానీ అపాయింట్‌మెంట్ ఉంటే వేచి ఉండాల్సిన అవసరం లేదు. ఇప్పుడే బుక్ చేయగలను.",
    category: "services",
    keywords: ["appointment", "booking", "walk in", "అపాయింట్‌మెంట్"],
    priority: 7,
    is_active: true,
  },
];

export const staff = [
  {
    clinic_id: CLINIC_ID,
    staff_id: STAFF_OWNER,
    role: "owner",
    status: "active",
    invited_at: at(-40, "09:00"),
    joined_at: at(-40, "09:05"),
    staff_profiles: {
      id: STAFF_OWNER,
      full_name: "Dr. Anitha Reddy",
      phone_e164: "+919849012345",
      locale: "te",
    },
  },
  {
    clinic_id: CLINIC_ID,
    staff_id: STAFF_RECEPTION,
    role: "receptionist",
    status: "active",
    invited_at: at(-30, "10:00"),
    joined_at: at(-29, "08:40"),
    staff_profiles: {
      id: STAFF_RECEPTION,
      full_name: "Sunitha",
      phone_e164: "+919885500011",
      locale: "te",
    },
  },
];

/** Analytics. The per-call cost mirrors the corrected ₹3.59 figure. */
export function analyticsSummary(days: number) {
  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const total = 4 + ((days - i) % 3) + (i % 2);
    const bookings = Math.max(1, Math.round(total * 0.42));
    daily.push({
      day: dateOnly(-i),
      total_calls: total,
      bookings,
      recovered_missed: Math.round(total / 3),
      telugu_calls: Math.round(total * 0.75),
      english_calls: total - Math.round(total * 0.75),
      escalations: i === 0 ? 1 : i % 3 === 0 ? 1 : 0,
    });
  }
  const calls_total = daily.reduce((s, d) => s + d.total_calls, 0);
  const bookings = daily.reduce((s, d) => s + d.bookings, 0);
  const recovered = daily.reduce((s, d) => s + d.recovered_missed, 0);
  const telugu = daily.reduce((s, d) => s + d.telugu_calls, 0);

  return {
    window_days: days,
    totals: {
      calls: calls_total,
      answered: calls_total,
      bookings,
      reschedules: Math.round(calls_total * 0.12),
      recovered_missed: recovered,
      escalations: 3,
      telugu_calls: telugu,
      english_calls: calls_total - telugu,
      // A whole percentage, matching routes/analytics.ts — the UI appends "%".
      conversion_rate: calls_total > 0 ? Math.round((bookings / calls_total) * 100) : 0,
    },
    open_action_items: {
      total: actionItems.length,
      urgent: actionItems.filter((a) => a.severity === "urgent").length,
      high: actionItems.filter((a) => a.severity === "high").length,
    },
    cost: {
      total_inr: Number((calls_total * 3.59).toFixed(2)),
      per_call_inr: 3.59,
    },
    daily,
  };
}

export function analyticsCosts(days: number) {
  return calls.slice(0, Math.min(calls.length, days * 2)).map((c) => ({
    call_id: c.id as string,
    cost_inr: 3.59,
    stt_micro_inr: 1_200_000,
    tts_micro_inr: 1_408_000,
    llm_micro_inr: 79_800,
    telephony_micro_inr: 900_000,
  }));
}

/** Availability for the booking dialog — three free slots, always live. */
/**
 * Free slots, morning and late afternoon, minus the doctor's time off — as
 * get_available_slots does. Without that, the reschedule screen offered
 * patients new times inside the very leave they were being moved out of.
 */
export function availability(doctorId: string, date: string) {
  const d = doctors.find((x) => x.id === doctorId);
  const dur = d?.consult_duration_min ?? 15;
  const off = doctorTimeOff.filter((t) => t.doctor_id === doctorId);
  const out = [];
  for (const [fromMin, count] of [
    [10 * 60, 6],
    [16 * 60, 4],
  ]) {
    for (let i = 0; i < count; i += 1) {
      const startMin = fromMin + i * dur;
      const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const mm = String(startMin % 60).padStart(2, "0");
      const endMin = startMin + dur;
      const eh = String(Math.floor(endMin / 60)).padStart(2, "0");
      const em = String(endMin % 60).padStart(2, "0");
      const start = new Date(`${date}T${hh}:${mm}:00+05:30`);
      const end = new Date(`${date}T${eh}:${em}:00+05:30`);
      const blocked = off.some((t) => start < new Date(t.ends_at) && end > new Date(t.starts_at));
      if (!blocked) out.push({ slot_start: start.toISOString(), slot_end: end.toISOString(), remaining: 1 });
    }
  }
  return out;
}

/** The signed-in patient, for the /me portal. */
export const patientMe = {
  patient: {
    id: PT_LAKSHMI,
    full_name: "Lakshmi Devi",
    phone_e164: "+919885512345",
    preferred_language: "te",
    date_of_birth: null,
    approx_age_years: 34,
    sex: "female",
  },
  clinic: {
    id: CLINIC_ID,
    name: "Sri Sai Clinic",
    phone_e164: "+918702345678",
    address_line: "2-4-118, Station Road",
    landmark: "Opposite Hanamkonda bus stand",
    city: "Warangal",
    pincode: "506001",
    map_url: null,
    timezone: IST,
  },
  upcoming: [
    {
      id: "66666666-6666-4666-8666-666666666621",
      // After Dr Anitha's 09:00–13:00 leave, so she is not one of the patients
      // that leave would have flagged.
      starts_at: at(NEXT_WORKDAY, "15:30"),
      status: "confirmed",
      reason: "BP follow-up",
      doctor_name: "Dr Anitha",
      doctor_specialty: "General Physician",
      doctor_colour: "#2F6BFF",
      consult_fee_paise: 15000,
      timezone: IST,
    },
  ],
  past: [
    {
      id: "66666666-6666-4666-8666-666666666622",
      starts_at: at(-21, "10:00"),
      status: "completed",
      reason: "Blood pressure check",
      doctor_name: "Dr Anitha",
      doctor_specialty: "General Physician",
      doctor_colour: "#2F6BFF",
      consult_fee_paise: 30000,
      timezone: IST,
    },
  ],
};

export const patientMedical = {
  visits: [
    {
      id: "0a000000-0000-4000-8000-000000000001",
      chief_complaint: "Headache and dizziness for three days",
      diagnosis_text: "Hypertension, poorly controlled",
      advice: "Reduce salt. Walk 30 minutes daily. Review in four weeks.",
      follow_up_days: 28,
      finalised_at: at(-21, "10:25"),
      visited_at: at(-21, "10:00"),
      doctor_name: "Dr Anitha",
      doctor_specialty: "General Physician",
      doctor_colour: "#2F6BFF",
    },
  ],
  prescriptions: [
    {
      id: "0b000000-0000-4000-8000-000000000001",
      issued_at: at(-21, "10:25"),
      notes: "Take after food. Do not stop without review.",
      doctor_name: "Dr Anitha",
      items: [
        {
          drug_name: "Amlodipine",
          strength: "5 mg",
          form: "tablet",
          dosage: "1 tablet",
          frequency: "Once daily",
          duration_days: 30,
          instructions_en: "Take one tablet every morning after breakfast.",
          instructions_te: "ప్రతి ఉదయం అల్పాహారం తర్వాత ఒక మాత్ర వేసుకోండి.",
        },
        {
          drug_name: "Metformin",
          strength: "500 mg",
          form: "tablet",
          dosage: "1 tablet",
          frequency: "Twice daily",
          duration_days: 30,
          instructions_en: "Take after breakfast and after dinner.",
          instructions_te: "అల్పాహారం తర్వాత మరియు రాత్రి భోజనం తర్వాత వేసుకోండి.",
        },
      ],
    },
  ],
  conditions: [
    {
      id: "0c000000-0000-4000-8000-000000000001",
      condition: "Hypertension",
      status: "chronic",
      onset_date: dateOnly(-400),
      resolved_date: null,
    },
    {
      id: "0c000000-0000-4000-8000-000000000002",
      condition: "Iron deficiency anaemia",
      status: "resolved",
      onset_date: dateOnly(-600),
      resolved_date: dateOnly(-300),
    },
  ],
  vaccinations: [
    {
      id: "0d000000-0000-4000-8000-000000000001",
      vaccine_code: "PENTA_2",
      dose_number: 2,
      due_date: dateOnly(7),
      administered_at: null,
      status: "due",
      vaccine_catalogue: { name: "Pentavalent 2", description: null },
    },
    {
      id: "0d000000-0000-4000-8000-000000000002",
      vaccine_code: "PENTA_1",
      dose_number: 1,
      due_date: dateOnly(-21),
      administered_at: at(-21, "11:20"),
      status: "administered",
      vaccine_catalogue: { name: "Pentavalent 1", description: null },
    },
  ],
};

/**
 * The no-login WhatsApp portal (`/p/[token]`).
 *
 * Deliberately thinner than the signed-in record: a forwarded link must expose
 * logistics only, never a diagnosis. Mirrors PortalData in lib/portal/api.ts.
 */
export const portalData = {
  patient: {
    id: PT_SRINIVAS,
    full_name: "Srinivas Rao",
    phone_e164: "+919701123456",
    preferred_language: "te",
  },
  clinic: {
    id: CLINIC_ID,
    name: "Sri Sai Clinic",
    phone_e164: "+918702345678",
    whatsapp_e164: "+918702345678",
    address_line: "2-4-118, Station Road",
    landmark: "Opposite Hanamkonda bus stand",
    city: "Warangal",
    pincode: "506001",
    map_url: null,
    timezone: IST,
    default_language: "te",
  },
  permissions: { may_reschedule: true, may_cancel: false },
  upcoming: [
    {
      id: "66666666-6666-4666-8666-666666666601",
      starts_at: at(NEXT_WORKDAY, "10:00"),
      ends_at: at(NEXT_WORKDAY, "10:15"),
      duration_min: 15,
      status: "needs_reschedule",
      reason: "BP follow-up",
      token_number: 4,
      confirmed_at: at(-1, "18:40"),
      doctor_name: "Dr Anitha",
      doctor_specialty: "General Physician",
      doctor_colour: "#2F6BFF",
      consult_fee_paise: 15000,
      clinic_name: "Sri Sai Clinic",
      clinic_phone: "+918702345678",
      address_line: "2-4-118, Station Road",
      landmark: "Opposite Hanamkonda bus stand",
      city: "Warangal",
      map_url: null,
      timezone: IST,
    },
  ],
  past: [
    {
      id: "66666666-6666-4666-8666-666666666631",
      starts_at: at(-28, "10:00"),
      ends_at: at(-28, "10:15"),
      duration_min: 15,
      status: "completed",
      reason: "Blood pressure check",
      token_number: 2,
      confirmed_at: at(-29, "17:10"),
      doctor_name: "Dr Anitha",
      doctor_specialty: "General Physician",
      doctor_colour: "#2F6BFF",
      consult_fee_paise: 30000,
      clinic_name: "Sri Sai Clinic",
      clinic_phone: "+918702345678",
      address_line: "2-4-118, Station Road",
      landmark: "Opposite Hanamkonda bus stand",
      city: "Warangal",
      map_url: null,
      timezone: IST,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Patient dashboard extras                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Care tasks — the follow-ups a care plan generated for this patient.
 * Real table (care_tasks); the patient UI never surfaced them before.
 */
export const patientCareTasks = [
  {
    id: "0e000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    patient_id: PT_LAKSHMI,
    title: "Hypertension review",
    template_key: "bp_review",
    due_on: dateOnly(3),
    status: "pending",
  },
  {
    id: "0e000000-0000-4000-8000-000000000002",
    clinic_id: CLINIC_ID,
    patient_id: PT_LAKSHMI,
    title: "Fasting blood sugar test",
    template_key: "fbs_test",
    due_on: dateOnly(-2),
    status: "pending",
  },
  {
    id: "0e000000-0000-4000-8000-000000000003",
    clinic_id: CLINIC_ID,
    patient_id: PT_LAKSHMI,
    title: "Collect prescription refill",
    template_key: "rx_refill",
    due_on: dateOnly(-9),
    status: "sent",
  },
];

/** Invoices — patient_invoices + items, so a patient can see what they owe. */
export const patientInvoices = [
  {
    id: "0f000000-0000-4000-8000-000000000001",
    clinic_id: CLINIC_ID,
    patient_id: PT_LAKSHMI,
    invoice_number: "SSC-2026-0418",
    subtotal_paise: 45000,
    discount_paise: 0,
    tax_paise: 0,
    total_paise: 45000,
    status: "issued",
    payment_mode: null,
    issued_at: at(-2, "11:10"),
    paid_at: null,
    items: [
      { description: "General consultation", quantity: 1, unit_price_paise: 30000 },
      { description: "Blood pressure check", quantity: 1, unit_price_paise: 10000 },
      { description: "Dressing", quantity: 1, unit_price_paise: 5000 },
    ],
  },
  {
    id: "0f000000-0000-4000-8000-000000000002",
    clinic_id: CLINIC_ID,
    patient_id: PT_LAKSHMI,
    invoice_number: "SSC-2026-0307",
    subtotal_paise: 30000,
    discount_paise: 0,
    tax_paise: 0,
    total_paise: 30000,
    status: "paid",
    payment_mode: "upi",
    issued_at: at(-21, "10:30"),
    paid_at: at(-21, "10:34"),
    items: [{ description: "General consultation", quantity: 1, unit_price_paise: 30000 }],
  },
];

/** Billing: a clinic on day 3 of its 14-day trial. */
export function billingStatus() {
  const trialEnd = new Date(Date.now() + 11 * 86_400_000).toISOString();
  return {
    plan: { code: "starter", name: "SAHVA for Clinics", monthly_price_paise: 199900, yearly_price_paise: 999900 },
    subscription: {
      id: "77777777-7777-4777-8777-777777777701",
      status: "trialing",
      billing_cycle: null as "monthly" | "yearly" | null,
      trial_ends_at: trialEnd,
      current_period_end: trialEnd,
    },
    payments: [] as {
      id: string;
      billing_cycle: "monthly" | "yearly";
      amount_paise: number;
      period_start: string;
      period_end: string;
      paid_at: string;
      razorpay_payment_id: string;
    }[],
    payments_enabled: true,
  };
}
