/**
 * Typed fetch wrappers. On the client, calls go through the Next.js rewrite
 * to the Express API. On the server (RSC), we need an absolute URL because
 * Next.js rewrites only proxy client-side fetches, so we read from
 * NEXT_PUBLIC_API_BASE (set automatically by the dev script and in prod).
 */
const ABS_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (typeof window === "undefined" ? "http://localhost:4000" : "");

function url(path: string): string {
  if (path.startsWith("http")) return path;
  if (typeof window === "undefined") return `${ABS_BASE}${path}`;
  return path; // client → Next.js rewrite handles the proxy
}
export type Clinic = {
  id: number;
  name: string;
  city: string | null;
  phone: string | null;
  created_at: string;
};

export type Doctor = {
  id: number;
  name: string;
  specialty: string | null;
  languages: string;
};

export type Patient = {
  id: number;
  clinic_id: number;
  name: string;
  phone: string;
  preferred_language: string | null;
  created_at: string;
};

export type Appointment = {
  id: number;
  patient_id: number;
  doctor_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  starts_at: string;
  duration_min: number;
  status: string;
  reason: string | null;
};

export type CallTurn = { role: "user" | "assistant" | "system"; content: string; ts?: string };

export type Call = {
  id: number;
  clinic_id: number;
  patient_id: number | null;
  patient_name: string | null;
  patient_phone: string | null;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  language: string | null;
  transcript: CallTurn[];
  summary: string | null;
  was_missed_before_ai: number;
};

export type AnalyticsSummary = {
  callsToday: number;
  callsAnswered: number;
  bookingsMade: number;
  cancellations: number;
  missedCallRecoveryRate: number;
  flagged: number;
  recovered: number;
  weekCalls: { day: string; calls: number; bookings: number }[];
  languageSplit: { en: number; te: number; mixed: number; unknown: number };
};

export type WhatsAppPreview = {
  appointment_id: number;
  to: string;
  patient_name: string;
  doctor_name: string;
  starts_at: string;
  message: string;
  sent_at: string;
  status: "delivered";
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(url(path), { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  return r.json();
}

export const api = {
  clinic: () => get<Clinic>("/api/clinic"),
  doctors: () => get<Doctor[]>("/api/doctors"),
  patients: (q?: string) => get<Patient[]>(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  appointments: (params: { from?: string; to?: string; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.status) q.set("status", params.status);
    return get<Appointment[]>(`/api/appointments${q.toString() ? `?${q}` : ""}`);
  },
  appointmentsCalendar: (from: string, to: string) =>
    get<Record<string, Appointment[]>>(`/api/appointments/calendar?from=${from}&to=${to}`),
  calls: (limit = 50, outcome?: string) =>
    get<Call[]>(`/api/calls?limit=${limit}${outcome ? `&outcome=${outcome}` : ""}`),
  call: (id: number) => get<Call>(`/api/calls/${id}`),
  analytics: () => get<AnalyticsSummary>("/api/analytics/summary"),
};
