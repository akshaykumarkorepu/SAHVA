/**
 * Mock API — `NEXT_PUBLIC_MOCK=1`.
 *
 * Serves the dashboard and patient portal from fixtures so the UI can be
 * reviewed without a Supabase project, an API process or an Anthropic key.
 * It exists because the Supabase project lives in someone else's organisation;
 * without it the only reviewable screens are the ones that render before login.
 *
 * This is a review and demo aid, not a test double. It never runs unless the
 * env var is set, and it is the only place in the app allowed to invent data.
 *
 * Writes mutate the in-memory fixtures, so resolving an action item or booking
 * an appointment behaves the way it will against the real API — until reload.
 */
import * as d from "./data";

export { isMockMode } from "./flag";

/** Network-ish delay, so loading states are visible rather than skipped. */
const LATENCY_MS = 180;

const actionItems = [...d.actionItems];
const appointments = [...d.appointments];
const faqs = [...d.faqs];
const services = [...d.services];
const doctors = [...d.doctors];
const hours = [...d.clinicHours];
const closures = [...d.clinicClosures];
const careTasks = d.patientCareTasks.map((t) => ({ ...t }));
let batch = { ...d.rescheduleBatch };
let settings = { ...d.clinic.settings };

function paged<T>(rows: T[], query: URLSearchParams) {
  const limit = Number(query.get("limit") ?? 50);
  const offset = Number(query.get("offset") ?? 0);
  return { data: rows.slice(offset, offset + limit), count: rows.length, limit, offset };
}

class MockNotFound extends Error {
  constructor(public readonly path: string) {
    super(`No mock route for ${path}`);
  }
}

/**
 * The signed-in staff role, overridable so a receptionist's view can be
 * checked without a second account: set localStorage "sahva.mock.role" to
 * "receptionist" (or "doctor", "manager"). Defaults to the fixture's owner.
 */
function mockRole(): string {
  try {
    return localStorage.getItem("sahva.mock.role") ?? d.me.role;
  } catch {
    return d.me.role;
  }
}

function route(method: string, pathname: string, query: URLSearchParams, body: unknown): unknown {
  const seg = pathname.split("/").filter(Boolean);
  const b = (body ?? {}) as Record<string, unknown>;

  // ---- clinic ------------------------------------------------------------
  if (method === "GET" && pathname === "/clinic") return { ...d.clinic, settings };
  if (method === "GET" && pathname === "/clinic/me") return { ...d.me, role: mockRole() };
  if (method === "PATCH" && pathname === "/clinic/settings") {
    settings = { ...settings, ...b };
    return settings;
  }
  if (method === "GET" && pathname === "/clinic/hours") return hours;
  if (method === "GET" && pathname === "/clinic/closures") return closures;
  if (method === "POST" && pathname === "/clinic/hours") {
    const row = {
      id: crypto.randomUUID(),
      clinic_id: d.clinic.id,
      day_of_week: Number(b.day_of_week ?? 1),
      opens_at: String(b.opens_at ?? "09:00"),
      closes_at: String(b.closes_at ?? "13:00"),
      label: String(b.label ?? "Morning"),
    };
    hours.push(row);
    return row;
  }
  if (method === "POST" && pathname === "/clinic/closures") {
    const row = {
      id: crypto.randomUUID(),
      clinic_id: d.clinic.id,
      starts_on: String(b.starts_on ?? ""),
      ends_on: String(b.ends_on ?? b.starts_on ?? ""),
      reason: String(b.reason ?? ""),
    };
    closures.push(row);
    return row;
  }
  if (method === "DELETE" && seg[0] === "clinic" && seg[1] === "hours" && seg[2]) {
    const i = hours.findIndex((h) => (h as { id: string }).id === seg[2]);
    if (i >= 0) hours.splice(i, 1);
    return undefined;
  }
  if (method === "DELETE" && seg[0] === "clinic" && seg[1] === "closures" && seg[2]) {
    const i = closures.findIndex((c) => c.id === seg[2]);
    if (i >= 0) closures.splice(i, 1);
    return undefined;
  }

  // ---- action required ---------------------------------------------------
  if (method === "GET" && pathname === "/actions") return actionItems;
  if (method === "POST" && seg[0] === "actions" && seg[2] === "resolve") {
    const i = actionItems.findIndex((a) => a.id === seg[1]);
    if (i >= 0) actionItems.splice(i, 1);
    return { ok: true };
  }
  if (method === "GET" && seg[0] === "actions" && seg[1] === "batches" && seg[2]) return batch;
  if (method === "POST" && seg[0] === "actions" && seg[1] === "batches" && seg[3] === "dispatch") {
    // The real table's reschedule_batches_human_dispatch CHECK requires both
    // dispatched_at and dispatched_by, so set both rather than half the pair.
    const now = new Date().toISOString();
    batch = {
      ...batch,
      status: "dispatched",
      notified_count: batch.total_affected,
      dispatched_at: now,
      dispatched_by: d.me.user_id,
      updated_at: now,
      items: batch.items.map((it) => ({ ...it, status: "notified", notified_at: now })),
    };
    const i = actionItems.findIndex((a) => a.related_batch_id === seg[2]);
    if (i >= 0) actionItems.splice(i, 1);
    return batch;
  }

  // ---- appointments ------------------------------------------------------
  if (method === "GET" && pathname === "/appointments/today") return d.todaysAppointments;
  if (method === "GET" && pathname === "/appointments") {
    // The real route filters on starts_at; without this the diary shows the
    // same rows whatever date you pick, which reads as a broken date picker.
    const from = query.get("from");
    const to = query.get("to");
    const rows = appointments.filter((a) => {
      const t = String(a.starts_at);
      return (!from || t >= new Date(from).toISOString()) && (!to || t <= new Date(to).toISOString());
    });
    return paged(rows, query);
  }
  if (method === "POST" && pathname === "/appointments") {
    const doc = doctors.find((x) => x.id === b.doctor_id) ?? doctors[0];
    const row = {
      id: crypto.randomUUID(),
      clinic_id: d.clinic.id,
      doctor_id: doc.id,
      patient_id: crypto.randomUUID(),
      starts_at: String(b.starts_at),
      ends_at: String(b.starts_at),
      duration_min: doc.consult_duration_min,
      status: "booked",
      source: "staff",
      reason: (b.reason as string) ?? null,
      token_number: appointments.length + 1,
      doctors: { id: doc.id, spoken_name: doc.spoken_name, specialty: doc.specialty, colour_hex: doc.colour_hex },
      patients: {
        id: crypto.randomUUID(),
        full_name: String(b.patient_name ?? "New patient"),
        phone_e164: String(b.phone ?? ""),
        preferred_language: "te",
      },
    };
    appointments.unshift(row);
    return row;
  }
  if (method === "POST" && seg[0] === "appointments" && seg[2] === "cancel") {
    const a = appointments.find((x) => x.id === seg[1]);
    if (a) a.status = "cancelled";
    return a ?? { ok: true };
  }
  if (method === "PATCH" && seg[0] === "appointments" && seg[2] === "status") {
    const a = appointments.find((x) => x.id === seg[1]);
    if (a) a.status = String(b.status);
    return a ?? { ok: true };
  }

  // ---- calls -------------------------------------------------------------
  if (method === "GET" && pathname === "/calls") {
    const outcome = query.get("outcome");
    const rows = outcome ? d.calls.filter((c) => c.outcome === outcome) : d.calls;
    return paged(rows, query);
  }
  if (method === "GET" && seg[0] === "calls" && seg[1]) {
    // Only one call has a transcript worth showing, so every detail view gets
    // it — with the row's own metadata on top so the header still matches.
    const found = d.calls.find((c) => c.id === seg[1]);
    return found ? { ...found, ...d.callDetail, id: found.id } : d.callDetail;
  }

  // ---- patients ----------------------------------------------------------
  if (method === "GET" && pathname === "/patients") {
    const q = (query.get("q") ?? "").toLowerCase();
    const rows = q
      ? d.patients.filter(
          (p) => p.full_name.toLowerCase().includes(q) || p.phone_e164.includes(q),
        )
      : d.patients;
    return paged(rows, query);
  }
  if (method === "POST" && seg[0] === "patients" && seg[2] === "portal-link") {
    return { url: `${location.origin}/p/mock-portal-token`, expires_at: new Date(Date.now() + 864e5).toISOString() };
  }

  // ---- doctors -----------------------------------------------------------
  if (method === "GET" && pathname === "/doctors") return doctors;
  if (method === "GET" && pathname === "/doctors/time-off") return d.doctorTimeOff;
  if (method === "POST" && pathname === "/doctors/time-off") return { id: crypto.randomUUID(), ...b };
  if (method === "GET" && seg[0] === "doctors" && seg[2] === "sessions") return d.doctorSessions;
  if (method === "GET" && seg[0] === "doctors" && seg[2] === "availability") {
    return d.availability(seg[1], query.get("date") ?? new Date().toISOString().slice(0, 10));
  }
  if (method === "POST" && pathname === "/doctors") {
    const row = { id: crypto.randomUUID(), clinic_id: d.clinic.id, is_active: true, ...b } as (typeof doctors)[number];
    doctors.push(row);
    return row;
  }
  if (method === "PATCH" && seg[0] === "doctors" && seg[1] && !seg[2]) {
    const i = doctors.findIndex((x) => x.id === seg[1]);
    if (i >= 0) doctors[i] = { ...doctors[i], ...b };
    return doctors[i] ?? { ok: true };
  }

  // ---- knowledge ---------------------------------------------------------
  if (method === "GET" && pathname === "/knowledge/faqs") return faqs;
  if (method === "GET" && pathname === "/knowledge/services") return services;
  if (method === "POST" && pathname === "/knowledge/faqs") {
    const row = { id: crypto.randomUUID(), clinic_id: d.clinic.id, is_active: true, ...b } as (typeof faqs)[number];
    faqs.unshift(row);
    return row;
  }
  if (method === "POST" && pathname === "/knowledge/services") {
    const row = { id: crypto.randomUUID(), clinic_id: d.clinic.id, is_active: true, ...b } as (typeof services)[number];
    services.unshift(row);
    return row;
  }
  if (method === "PATCH" && seg[0] === "knowledge" && seg[1] === "faqs" && seg[2]) {
    const i = faqs.findIndex((f) => f.id === seg[2]);
    if (i >= 0) faqs[i] = { ...faqs[i], ...b };
    return faqs[i] ?? { ok: true };
  }
  if (method === "PATCH" && seg[0] === "knowledge" && seg[1] === "services" && seg[2]) {
    const i = services.findIndex((s) => s.id === seg[2]);
    if (i >= 0) services[i] = { ...services[i], ...b };
    return services[i] ?? { ok: true };
  }
  if (method === "DELETE" && seg[0] === "knowledge" && seg[1] === "faqs" && seg[2]) {
    const i = faqs.findIndex((f) => f.id === seg[2]);
    if (i >= 0) faqs.splice(i, 1);
    return undefined;
  }
  if (method === "DELETE" && seg[0] === "knowledge" && seg[1] === "services" && seg[2]) {
    const i = services.findIndex((s) => s.id === seg[2]);
    if (i >= 0) services.splice(i, 1);
    return undefined;
  }

  // ---- staff -------------------------------------------------------------
  if (method === "GET" && pathname === "/staff") return d.staff;
  if (method === "POST" && pathname === "/staff/invite") {
    return { ok: true, invited: b.email ?? null };
  }

  // ---- analytics ---------------------------------------------------------
  if (method === "GET" && pathname === "/analytics/summary") {
    return d.analyticsSummary(Number(query.get("days") ?? 7));
  }
  if (method === "GET" && pathname === "/analytics/costs") {
    return d.analyticsCosts(Number(query.get("days") ?? 30));
  }

  // ---- patient portal ----------------------------------------------------
  if (method === "GET" && pathname === "/me") return d.patientMe;
  if (method === "GET" && pathname === "/me/medical") return d.patientMedical;
  if (method === "GET" && pathname === "/me/tasks")
    return careTasks.filter((t) => t.status === "pending" || t.status === "sent");
  if (method === "GET" && pathname === "/me/invoices") return d.patientInvoices;

  throw new MockNotFound(pathname);
}

/** The no-login portal has its own client, so it needs its own mock router. */
const portal = { ...d.portalData };

export async function mockPortal<T>(
  _token: string,
  path = "",
  init: RequestInit = {},
): Promise<T> {
  const [rawPath, rawQuery = ""] = path.split("?");
  const query = new URLSearchParams(rawQuery);
  const method = (init.method ?? "GET").toUpperCase();
  const seg = rawPath.split("/").filter(Boolean);

  await new Promise((r) => setTimeout(r, LATENCY_MS));

  if (method === "GET" && rawPath === "") return portal as T;

  if (seg[0] === "appointments" && seg[2] === "slots") {
    return d.availability(
      DOC_FOR_PORTAL,
      query.get("date") ?? new Date().toISOString().slice(0, 10),
    ) as T;
  }

  if (method === "POST" && seg[0] === "appointments" && seg[2] === "confirm") {
    portal.upcoming = portal.upcoming.map((a) =>
      a.id === seg[1] ? { ...a, status: "confirmed", confirmed_at: new Date().toISOString() } : a,
    );
    return undefined as T;
  }
  if (method === "POST" && seg[0] === "appointments" && seg[2] === "cancel") {
    portal.upcoming = portal.upcoming.filter((a) => a.id !== seg[1]);
    return undefined as T;
  }
  if (method === "POST" && seg[0] === "appointments" && seg[2] === "reschedule") {
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    portal.upcoming = portal.upcoming.map((a) =>
      a.id === seg[1] ? { ...a, starts_at: String(body.starts_at ?? a.starts_at), status: "booked" } : a,
    );
    return undefined as T;
  }
  if (method === "POST" && seg[0] === "account") return { ok: true } as T;

  throw new MockNotFound(rawPath);
}

/** Dr Anitha — the only doctor the portal's seeded appointment belongs to. */
const DOC_FOR_PORTAL = "22222222-2222-4222-8222-222222222201";

/**
 * Entry point used by lib/api.ts. Mirrors `api()`'s contract: resolves with the
 * parsed body, or throws so the caller's ApiError path still runs.
 */
export async function mockApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const [rawPath, rawQuery = ""] = path.split("?");
  const query = new URLSearchParams(rawQuery);
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  await new Promise((r) => setTimeout(r, LATENCY_MS));

  const result = route(method, rawPath, query, body);
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug(`[mock] ${method} ${path}`);
  }
  // A copy, as a real response would be. Handing out the live fixture array
  // means a later splice mutates data React already holds, and the cache sees
  // the "new" result as the same reference and skips the re-render.
  return (result === undefined ? result : structuredClone(result)) as T;
}
