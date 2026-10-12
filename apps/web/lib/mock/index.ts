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
import { ApiError } from "../api";

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

/** True when a live appointment already holds this doctor's slot. */
function isTaken(doctorId: string, startsAt: string): boolean {
  const t = new Date(startsAt).getTime();
  return appointments.some(
    (a) =>
      a.doctor_id === doctorId &&
      a.status !== "cancelled" &&
      a.status !== "needs_reschedule" &&
      new Date(String(a.starts_at)).getTime() === t,
  );
}

/** One-shot: set localStorage "sahva.mock.slotTaken" to make the next booking lose the race. */
function takeSwitch(): boolean {
  try {
    if (localStorage.getItem("sahva.mock.slotTaken") !== "1") return false;
    localStorage.removeItem("sahva.mock.slotTaken");
    return true;
  } catch {
    return false;
  }
}

/** Mirrors sahva.sync_batch_progress: counts come from the items. */
function syncBatch() {
  const told = batch.items.filter((it) => it.status === "notified" || it.status === "rebooked").length;
  const rebooked = batch.items.filter((it) => it.status === "rebooked").length;
  const open = batch.items.filter((it) => it.status === "pending" || it.status === "notified").length;
  batch = { ...batch, notified_count: told, rebooked_count: rebooked };
  if (open === 0 && batch.status === "notifying") {
    batch = { ...batch, status: "completed" };
    const i = actionItems.findIndex((a) => a.related_batch_id === batch.id);
    if (i >= 0) actionItems.splice(i, 1);
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
    // Approval only. The real API moves the batch to 'notifying' and sends
    // nothing — no worker exists — so the mock must not pretend patients were
    // told. It used to mark every one "notified" on the spot.
    if (batch.status !== "draft") throw new ApiError(400, "BATCH_NOT_DRAFT", `Batch is already ${batch.status}.`);
    const now = new Date().toISOString();
    batch = { ...batch, status: "notifying", dispatched_at: now, dispatched_by: d.me.user_id, updated_at: now };
    syncBatch();
    return batch;
  }
  if (method === "POST" && seg[0] === "actions" && seg[1] === "batch-items" && seg[3] === "status") {
    // Mirrors sahva.guard_batch_item_contact.
    if (batch.status === "draft") {
      throw new ApiError(400, "CONSTRAINT_VIOLATED", "That change is not allowed.",
        "Approve this reschedule batch before recording contact with patients");
    }
    const item = batch.items.find((it) => it.id === seg[2]);
    if (!item) throw new MockNotFound(pathname);
    item.status = String(b.status) as typeof item.status;
    syncBatch();
    return item;
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
  if (method === "POST" && pathname === "/appointments/walk-in") {
    // Mirrors the API: next free slot today, then a token from the doctor's
    // own per-day sequence (sahva.assign_token_number).
    const doc = doctors.find((x) => x.id === b.doctor_id) ?? doctors[0];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const slot = d.availability(doc.id, today).find(
      (sl) => new Date(sl.slot_start) > new Date() && !isTaken(doc.id, sl.slot_start),
    );
    if (!slot) throw new ApiError(409, "NO_SLOT_TODAY", "This doctor has no free time left today.");
    const sameDay = appointments.filter(
      (a) => a.doctor_id === doc.id && String(a.starts_at).slice(0, 10) === slot.slot_start.slice(0, 10),
    );
    const row = {
      ...appointments[0],
      id: crypto.randomUUID(),
      doctor_id: doc.id,
      patient_id: crypto.randomUUID(),
      starts_at: slot.slot_start,
      ends_at: slot.slot_end,
      status: "booked",
      source: "walk_in",
      reason: "Walk-in",
      token_number: Math.max(0, ...sameDay.map((a) => Number(a.token_number ?? 0))) + 1,
      doctors: { id: doc.id, spoken_name: doc.spoken_name, specialty: doc.specialty, colour_hex: doc.colour_hex },
      patients: { ...appointments[0].patients, full_name: String(b.patient_name), phone_e164: String(b.phone) },
    };
    appointments.unshift(row);
    return row;
  }
  if (method === "POST" && pathname === "/appointments") {
    // Mirrors appointments_no_double_booking. The localStorage switch lets a
    // test lose the race on purpose — the slot "goes" between seeing it and
    // booking it, which is otherwise impossible to stage in one browser.
    if (takeSwitch()) {
      // Someone else books it first — for real, so the refreshed list drops it.
      const doc = doctors.find((x) => x.id === b.doctor_id) ?? doctors[0];
      appointments.unshift({
        ...appointments[0],
        id: crypto.randomUUID(),
        doctor_id: doc.id,
        starts_at: String(b.starts_at),
        ends_at: String(b.starts_at),
        status: "booked",
        source: "ai_call",
        patients: { ...appointments[0].patients, full_name: "Another caller" },
      });
    }
    if (isTaken(String(b.doctor_id), String(b.starts_at))) {
      throw new ApiError(409, "SLOT_TAKEN", "That time is no longer available.", undefined,
        "Fetch fresh availability and offer the next free slot.");
    }
    const doc = doctors.find((x) => x.id === b.doctor_id) ?? doctors[0];
    const row = {
      id: crypto.randomUUID(),
      clinic_id: d.clinic.id,
      doctor_id: doc.id,
      patient_id: crypto.randomUUID(),
      starts_at: String(b.starts_at),
      ends_at: new Date(new Date(String(b.starts_at)).getTime() + doc.consult_duration_min * 60_000).toISOString(),
      duration_min: doc.consult_duration_min,
      status: "booked",
      source: "staff_manual",
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
  if (method === "POST" && seg[0] === "appointments" && seg[2] === "reschedule") {
    // Mirrors reschedule_appointment plus the trigger that links the rebook
    // back to its batch item.
    const item = batch.items.find((it) => it.appointment_id === seg[1]);
    if (item?.status === "rebooked") {
      throw new ApiError(409, "INVALID_STATE", "Appointment is already cancelled");
    }
    const created = { id: crypto.randomUUID(), starts_at: String(b.new_starts_at) };
    if (item) {
      item.status = "rebooked";
      item.new_appointment_id = created.id;
      item.new_appointment = created;
      syncBatch();
    }
    return created;
  }
  if (method === "POST" && seg[0] === "appointments" && seg[2] === "status") {
    // Mirrors set_appointment_status: front-desk changes only, and never on a
    // finished appointment.
    const status = String(b.status);
    const rows = [...appointments, ...d.todaysAppointments].filter((x) => x.id === seg[1]);
    if (rows.length === 0) throw new MockNotFound(pathname);
    for (const row of rows) {
      if (row.status === "completed" || row.status === "cancelled") {
        throw new Error(`Appointment is already ${row.status}`);
      }
      row.status = status;
    }
    return rows[0];
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
  if (method === "GET" && seg[0] === "patients" && seg.length === 2 && seg[1] !== "by-phone") {
    // Same shape as GET /patients/:id: the patient plus their appointments.
    const p = d.patients.find((x) => x.id === seg[1]);
    if (!p) throw new MockNotFound(pathname);
    return { ...p, appointments: appointments.filter((a) => a.patient_id === seg[1]) };
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
    // Like get_available_slots: a slot someone already holds is not offered.
    return d
      .availability(seg[1], query.get("date") ?? new Date().toISOString().slice(0, 10))
      .filter((sl) => !isTaken(seg[1], sl.slot_start));
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
