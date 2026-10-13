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
let billing = d.billingStatus();
const pendingOrders = new Map<string, { cycle: "monthly" | "yearly"; amount: number }>();
let settings = { transcript_retention_days: 90, receptionists_see_transcripts: !mockFlag("sahva.mock.hideTranscripts"), ...d.clinic.settings };

function paged<T>(rows: T[], query: URLSearchParams) {
  const limit = Number(query.get("limit") ?? 50);
  const offset = Number(query.get("offset") ?? 0);
  return { data: rows.slice(offset, offset + limit), count: rows.length, limit, offset };
}

/** A localStorage knob for tests; false when storage is unavailable. */
function mockFlag(key: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
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

/**
 * The clinic's verification, approved like the fixture clinic unless
 * localStorage "sahva.mock.verification" names another status — so the
 * pending and needs-info screens can be seen and tested.
 */
let verificationOverride: Record<string, unknown> | null = null;

/** Clinics waiting for review, for the admin console. */
const applications = [
  {
    id: "c1000000-0000-4000-8000-000000000001", name: "Padma Children's Clinic", city: "Karimnagar", address_line: "1-2-3 Main Road",
    pincode: "505001", phone_e164: "+918712000111", verification_status: "submitted", hfr_id: "IN3610000099",
    establishment_reg_no: null, registration_state: null, owner_reg_no: "TSMC/12345", owner_council: "Telangana State Medical Council",
    gstin: null, submitted_at: new Date(Date.now() - 2 * 864e5).toISOString(), reviewed_at: null, review_note: null as string | null,
    owner_name: "Dr Padma",
    docs: [{ id: "d1", kind: "facility_registration", file_name: "hfr-certificate.pdf", url: "about:blank", uploaded_at: new Date().toISOString() }],
  },
  {
    id: "c1000000-0000-4000-8000-000000000002", name: "Anand Clinic", city: "Warangal", address_line: null,
    pincode: "506002", phone_e164: "+918712100002", verification_status: "under_review", hfr_id: null,
    establishment_reg_no: "TS/CE/2024/0457", registration_state: "Telangana", owner_reg_no: "TSMC/12345", owner_council: "Telangana State Medical Council",
    gstin: "36ABCDE1234F1Z5", submitted_at: new Date(Date.now() - 864e5).toISOString(), reviewed_at: null, review_note: null as string | null,
    owner_name: "Dr Anand", docs: [] as { id: string; kind: string; file_name: string; url: string; uploaded_at: string }[],
  },
  {
    id: "c1000000-0000-4000-8000-000000000003", name: "Lotus Clinic", city: "Nizamabad", address_line: null,
    pincode: null, phone_e164: "+918712100009", verification_status: "needs_info", hfr_id: "IN3610000777",
    establishment_reg_no: null, registration_state: null, owner_reg_no: "APMC/9", owner_council: "Andhra Pradesh Medical Council",
    gstin: null, submitted_at: new Date(Date.now() - 4 * 864e5).toISOString(), reviewed_at: null,
    review_note: "Certificate photo is unreadable" as string | null, owner_name: "Dr Latha", docs: [],
  },
];
/** Clinics as the admin console lists them (admin_clinic_summaries). */
const day = 864e5;
const adminClinicRows = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Sri Sai Clinic", city: "Warangal", verification_status: "approved", created_at: new Date(Date.now() - 40 * day).toISOString(), subscription_status: "active" as string | null, billing_cycle: "yearly" as string | null, current_period_end: new Date(Date.now() + 300 * day).toISOString() as string | null, is_live: true, staff: 3, patients: 214, appointments_30d: 182, ai_bookings_30d: 97, last_appointment_at: new Date(Date.now() - 3600e3).toISOString() as string | null, paid_total_paise: 999900 },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Krishna Clinic", city: "Karimnagar", verification_status: "approved", created_at: new Date(Date.now() - 16 * day).toISOString(), subscription_status: "trialing", billing_cycle: null, current_period_end: new Date(Date.now() - 1 * day).toISOString(), is_live: true, staff: 2, patients: 38, appointments_30d: 41, ai_bookings_30d: 22, last_appointment_at: new Date(Date.now() - 2 * day).toISOString(), paid_total_paise: 0 },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Lotus Clinic", city: "Nizamabad", verification_status: "approved", created_at: new Date(Date.now() - 30 * day).toISOString(), subscription_status: "trialing", billing_cycle: null, current_period_end: new Date(Date.now() - 9 * day).toISOString(), is_live: false, staff: 1, patients: 6, appointments_30d: 4, ai_bookings_30d: 0, last_appointment_at: new Date(Date.now() - 12 * day).toISOString(), paid_total_paise: 0 },
  { id: "a0000000-0000-4000-8000-000000000004", name: "Padma Children's Clinic", city: "Karimnagar", verification_status: "submitted", created_at: new Date(Date.now() - 2 * day).toISOString(), subscription_status: null, billing_cycle: null, current_period_end: null, is_live: false, staff: 1, patients: 0, appointments_30d: 0, ai_bookings_30d: 0, last_appointment_at: null, paid_total_paise: 0 },
];
function adminClinics() {
  // is_live follows the 3-day grace rule, as the database computes it.
  return adminClinicRows.map((c) => ({
    ...c,
    is_live: c.verification_status === "approved" && (!c.current_period_end || new Date(c.current_period_end).getTime() + 3 * day > Date.now()),
  }));
}
/** Payments as the admin ledger shows them, with one duplicate to deal with. */
const ledger = [
  { id: "l1", clinic_id: "a0000000-0000-4000-8000-000000000001", billing_cycle: "yearly", amount_paise: 999900, captured_paise: 999900 as number | null, refunded_paise: 0, status: "paid", razorpay_order_id: "order_mock_y1", razorpay_payment_id: "pay_mock_y1" as string | null, period_start: new Date(Date.now() - 20 * day).toISOString(), period_end: new Date(Date.now() + 345 * day).toISOString(), created_at: new Date(Date.now() - 20 * day).toISOString(), paid_at: new Date(Date.now() - 20 * day).toISOString() as string | null, clinics: { name: "Sri Sai Clinic", city: "Warangal" } },
  { id: "l2", clinic_id: "a0000000-0000-4000-8000-000000000002", billing_cycle: "monthly", amount_paise: 199900, captured_paise: 199900, refunded_paise: 0, status: "paid", razorpay_order_id: "order_mock_m1", razorpay_payment_id: "pay_mock_m1", period_start: new Date(Date.now() - 2 * day).toISOString(), period_end: new Date(Date.now() + 28 * day).toISOString(), created_at: new Date(Date.now() - 2 * day).toISOString(), paid_at: new Date(Date.now() - 2 * day).toISOString(), clinics: { name: "Krishna Clinic", city: "Karimnagar" } },
  { id: "l3", clinic_id: "a0000000-0000-4000-8000-000000000002", billing_cycle: "monthly", amount_paise: 199900, captured_paise: 199900, refunded_paise: 0, status: "paid", razorpay_order_id: "order_mock_m2", razorpay_payment_id: "pay_mock_m2", period_start: new Date(Date.now() + 28 * day).toISOString(), period_end: new Date(Date.now() + 58 * day).toISOString(), created_at: new Date(Date.now() - 2 * day + 600e3).toISOString(), paid_at: new Date(Date.now() - 2 * day + 600e3).toISOString(), clinics: { name: "Krishna Clinic", city: "Karimnagar" } },
  { id: "l4", clinic_id: "a0000000-0000-4000-8000-000000000003", billing_cycle: "monthly", amount_paise: 199900, captured_paise: null, refunded_paise: 0, status: "created", razorpay_order_id: "order_mock_open", razorpay_payment_id: null, period_start: null, period_end: null, created_at: new Date(Date.now() - 3 * 3600e3).toISOString(), paid_at: null, clinics: { name: "Lotus Clinic", city: "Nizamabad" } },
];
const paymentExceptions = [
  { id: "e1", kind: "duplicate_payment", status: "open", clinic_id: "a0000000-0000-4000-8000-000000000002", razorpay_payment_id: "pay_mock_m2", razorpay_order_id: "order_mock_m2", amount_paise: 199900 as number | null, details: { note: "Another payment for this subscription was made in the last 30 minutes" } as Record<string, unknown>, detected_at: new Date(Date.now() - 2 * day + 600e3).toISOString(), resolution: null as string | null, clinics: { name: "Krishna Clinic" } },
];
const paymentEvents: { id: string; event_type: string | null; signature_ok: boolean; razorpay_payment_id: string | null; razorpay_order_id: string | null; amount_paise: number | null; outcome: string | null; received_at: string }[] = [
  { id: "ev1", event_type: "payment.captured", signature_ok: true, razorpay_payment_id: "pay_mock_m2", razorpay_order_id: "order_mock_m2", amount_paise: 199900, outcome: "activated", received_at: new Date(Date.now() - 2 * day + 600e3).toISOString() },
  { id: "ev2", event_type: null, signature_ok: false, razorpay_payment_id: null, razorpay_order_id: null, amount_paise: null, outcome: "rejected: bad signature", received_at: new Date(Date.now() - day).toISOString() },
];
// ---- step 6: invoices, refund approvals, support access, emails ----
const platformSettings = {
  legal_name: "SAHVA Health Technologies Pvt Ltd", address: "Plot 12, Hanamkonda, Warangal 506001", state: "Telangana", state_code: "36",
  gstin: "36AAACS1234A1Z1" as string | null, pan: "AAACS1234A" as string | null, email: "billing@sahva.example", phone: "+914023456789",
  sac_code: "997331", gst_rate_bps: 1800, refund_second_approval_paise: 200000,
};
const ME_ADMIN = "ad000000-0000-4000-8000-000000000001";
const refundRequests: {
  id: string; clinic_id: string; payment_id: string; amount_paise: number; revoke_period: boolean; reason: string;
  status: string; requested_by: string; requested_at: string; decided_at: string | null; decision_note: string | null;
  clinics: { name: string }; subscription_payments: { razorpay_payment_id: string | null; billing_cycle: string; amount_paise: number };
  requester: { full_name: string }; decider: { full_name: string } | null;
}[] = [
  {
    id: "rr1", clinic_id: "a0000000-0000-4000-8000-000000000001", payment_id: "l1", amount_paise: 833200, revoke_period: true,
    reason: "Clinic is moving to a hospital system; refund the unused 10 months", status: "pending", requested_by: "ad000000-0000-4000-8000-000000000002",
    requested_at: new Date(Date.now() - 3 * 3600e3).toISOString(), decided_at: null, decision_note: null, clinics: { name: "Sri Sai Clinic" },
    subscription_payments: { razorpay_payment_id: "pay_mock_y1", billing_cycle: "yearly", amount_paise: 999900 }, requester: { full_name: "Finance Two" }, decider: null,
  },
];
const supportGrants: { id: string; reason: string; created_at: string; expires_at: string; revoked_at: string | null; granted_by: string | null; active: boolean; records_opened: number }[] = [];
const supportPatients = [
  { id: "f0000000-0000-4000-8000-000000000001", full_name: "Lakshmi Devi", phone_e164: "+919876500001", sex: "female", date_of_birth: "1971-03-02", preferred_language: "te", created_at: new Date(Date.now() - 90 * 864e5).toISOString() },
  { id: "f0000000-0000-4000-8000-000000000002", full_name: "Mohan Kumar", phone_e164: "+919876500002", sex: "male", date_of_birth: null, preferred_language: "te", created_at: new Date(Date.now() - 30 * 864e5).toISOString() },
];
/** As sahva.issue_invoice builds it: GST-inclusive, CGST + SGST for a Telangana buyer. */
function mockInvoice(id: string, kind: "invoice" | "credit_note", n: number, total: number, cycle: string, start: string | null, end: string | null, buyer: string, clinicId: string) {
  const tax = platformSettings.gstin ? total - Math.round((total * 10000) / (10000 + platformSettings.gst_rate_bps)) : 0;
  return {
    id, kind, clinic_id: clinicId, number: `${kind === "invoice" ? "INV" : "CN"}/26-27/${String(n).padStart(5, "0")}`, issued_at: new Date().toISOString(),
    seller: { ...platformSettings }, buyer: { name: buyer, address: "Station Road, Hanamkonda, Warangal, Telangana, 506001", state: "Telangana", state_code: "36", gstin: null },
    description: `SAHVA for Clinics — ${cycle === "yearly" ? "1 year" : "1 month"} subscription`, sac_code: platformSettings.sac_code,
    period_start: start, period_end: end, is_tax_invoice: !!platformSettings.gstin, gst_rate_bps: platformSettings.gstin ? platformSettings.gst_rate_bps : 0,
    taxable_paise: total - tax, cgst_paise: Math.floor(tax / 2), sgst_paise: tax - Math.floor(tax / 2), igst_paise: 0, total_paise: total,
  };
}
const adminNotes: { id: string; clinic_id: string; body: string; created_at: string; platform_admins: { full_name: string } }[] = [];
const applicationHistory: { id: string; target_id: string; action: string; reason: string | null; created_at: string; platform_admins: { full_name: string } }[] = [];
const clinicDocuments: Record<string, unknown>[] = [];
function mockVerification(): Record<string, unknown> {
  if (verificationOverride) return verificationOverride;
  let status = "approved";
  try {
    status = localStorage.getItem("sahva.mock.verification") ?? "approved";
  } catch {
    /* default */
  }
  return {
    verification_status: status,
    review_note: status === "needs_info" ? "The registration certificate photo is unreadable — please upload a clearer copy." : null,
    hfr_id: null,
    establishment_reg_no: "TS/CE/2019/1182",
    registration_state: "Telangana",
    owner_reg_no: "TSMC/48213",
    owner_council: "Telangana State Medical Council",
    gstin: null,
    submitted_at: new Date(Date.now() - 864e5).toISOString(),
  };
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
  if (method === "GET" && pathname === "/clinic") return { ...d.clinic, settings, ...mockVerification() };
  if (method === "PATCH" && pathname === "/clinic/application") {
    verificationOverride = { ...mockVerification(), ...b, verification_status: "submitted", review_note: null };
    return { ...d.clinic, ...verificationOverride };
  }
  if (method === "GET" && pathname === "/clinic/documents") return clinicDocuments;
  if (method === "POST" && pathname === "/clinic/documents") {
    const row = {
      id: crypto.randomUUID(),
      kind: query.get("kind") ?? "other",
      file_name: query.get("name") ?? "document",
      content_type: "application/pdf",
      size_bytes: 1,
      uploaded_at: new Date().toISOString(),
    };
    clinicDocuments.unshift(row);
    return row;
  }
  if (method === "GET" && pathname === "/clinic/me") return { ...d.me, role: mockRole() };
  if (method === "GET" && pathname === "/whoami") return { kind: "staff", email: d.me.email };
  if (method === "GET" && pathname === "/clinic/support-access") {
    const now = Date.now();
    return supportGrants.map((g) => ({ ...g, active: !g.revoked_at && new Date(g.expires_at).getTime() > now }));
  }
  if (method === "POST" && pathname === "/clinic/support-access") {
    // Mirrors grant_support_access(): owner only, 1–72 hours, one open at a time.
    if (mockRole() !== "owner") throw new ApiError(403, "FORBIDDEN", "Only the clinic owner can open access for SAHVA support");
    if (supportGrants.some((g) => !g.revoked_at && new Date(g.expires_at).getTime() > Date.now()))
      throw new ApiError(400, "ALREADY_OPEN", "Support access is already open. Close it first.");
    const g = { id: crypto.randomUUID(), reason: String(b.reason), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + Number(b.hours) * 3600e3).toISOString(), revoked_at: null as string | null, granted_by: "Ravi Kumar", active: true, records_opened: 0 };
    supportGrants.unshift(g);
    return g;
  }
  if (method === "POST" && seg[0] === "clinic" && seg[1] === "support-access" && seg[3] === "revoke") {
    const g = supportGrants.find((x) => x.id === seg[2]);
    if (!g) throw new MockNotFound(pathname);
    g.revoked_at = g.revoked_at ?? new Date().toISOString();
    return g;
  }
  if (method === "PATCH" && pathname === "/clinic/settings") {
    // Mirrors routes/clinic.ts: privacy settings are the owner's alone.
    if (("transcript_retention_days" in b || "receptionists_see_transcripts" in b) && mockRole() !== "owner")
      throw new ApiError(403, "FORBIDDEN", "Only the clinic owner can change how transcripts are kept and shown.");
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
    const detail = found ? { ...found, ...d.callDetail, id: found.id } : d.callDetail;
    // Mirrors log_call_access(): receptionists see no words when the owner hides them.
    if (mockRole() === "receptionist" && !settings.receptionists_see_transcripts)
      return { ...detail, turns: [], tool_invocations: [], summary: null, transcript_status: "restricted" };
    return { ...detail, transcript_status: "available" };
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
  if (method === "GET" && seg[0] === "patients" && seg[2] === "access-log") {
    // As the API returns it: names resolved, newest first.
    return [
      { id: "al-1", actor_type: "staff", actor_name: "Geeta", record_type: "patient_profile", accessed_at: new Date().toISOString() },
      { id: "al-2", actor_type: "patient", actor_name: "The patient", record_type: "medical_record", accessed_at: new Date(Date.now() - 864e5).toISOString() },
    ];
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

  // ---- platform admin ------------------------------------------------------
  if (method === "GET" && pathname === "/admin/me") return { user_id: "ad000000-0000-4000-8000-000000000001", email: "ops@sahva.example", role: "super_admin", full_name: "Ops Admin" };
  if (method === "POST" && pathname === "/admin/sessions") return { ok: true };
  if (method === "GET" && pathname === "/admin/overview") {
    return {
      clinics: 14, newClinicsThisMonth: 3, trialing: 5, trialsEndingIn3Days: 2, paying: 7,
      payingMonthly: 4, payingYearly: 3, lapsed: 2,
      mrrPaise: 4 * 199900 + Math.round((3 * 999900) / 12), arrPaise: (4 * 199900 + Math.round((3 * 999900) / 12)) * 12,
      collectedThisMonthPaise: 2 * 199900 + 999900, paymentsThisMonth: 3,
      payingFromLedger: 2,
      refundApprovalsWaiting: refundRequests.filter((r) => r.status === "pending").length,
      openPaymentExceptions: paymentExceptions.filter((e) => e.status === "open").length,
      applicationsWaiting: applications.filter((a) => ["submitted", "under_review"].includes(a.verification_status)).length,
    };
  }
  if (method === "GET" && pathname === "/admin/audit") {
    return [
      { id: "aa1", action: "admin.sign_in", target_type: null, target_id: null, reason: null, created_at: new Date().toISOString(), platform_admins: { full_name: "Ops Admin" } },
    ];
  }

  if (method === "GET" && pathname === "/admin/applications") {
    const groups: Record<string, string[]> = {
      waiting: ["submitted", "under_review"], needs_info: ["needs_info"], approved: ["approved"],
      rejected: ["rejected"], suspended: ["suspended"],
    };
    const g = groups[query.get("status") ?? "waiting"] ?? groups.waiting;
    const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, applications.filter((a) => v.includes(a.verification_status)).length]));
    return { rows: applications.filter((a) => g.includes(a.verification_status)), counts };
  }
  if (method === "GET" && seg[0] === "admin" && seg[1] === "applications" && seg[2]) {
    const c = applications.find((a) => a.id === seg[2]);
    if (!c) throw new MockNotFound(pathname);
    return {
      clinic: c,
      owner: { full_name: c.owner_name, phone: "+919848000111", email: "owner@example.in" },
      documents: c.docs,
      possible_duplicates: applications
        .filter((o) => o.id !== c.id && (o.owner_reg_no === c.owner_reg_no || (o.name === c.name && o.city === c.city)))
        .map((o) => ({ id: o.id, name: o.name, city: o.city, verification_status: o.verification_status, owner_reg_no: o.owner_reg_no })),
      history: applicationHistory.filter((h) => h.target_id === c.id),
    };
  }
  if (method === "POST" && seg[0] === "admin" && seg[1] === "applications" && seg[3] === "decision") {
    // Mirrors admin_review_clinic(): allowed transitions, reasons where required.
    const c = applications.find((a) => a.id === seg[2]);
    if (!c) throw new MockNotFound(pathname);
    const rules: Record<string, [string, string[]]> = {
      start_review: ["under_review", ["submitted"]], approve: ["approved", ["submitted", "under_review"]],
      needs_info: ["needs_info", ["submitted", "under_review"]], reject: ["rejected", ["submitted", "under_review", "needs_info"]],
      suspend: ["suspended", ["approved"]], reinstate: ["approved", ["suspended"]],
    };
    const [to, from] = rules[String(b.decision)];
    if (!from.includes(c.verification_status)) throw new ApiError(409, "INVALID_STATE", `Cannot ${b.decision} a clinic that is ${c.verification_status}`);
    if (["needs_info", "reject", "suspend"].includes(String(b.decision)) && !String(b.note ?? "").trim()) {
      throw new ApiError(409, "INVALID_STATE", "A reason is required");
    }
    c.verification_status = to;
    c.review_note = (b.note as string) ?? null;
    applicationHistory.unshift({ id: crypto.randomUUID(), target_id: c.id, action: `clinic.${b.decision}`, reason: (b.note as string) ?? null, created_at: new Date().toISOString(), platform_admins: { full_name: "Ops Admin" } });
    return c;
  }

  if (method === "GET" && pathname === "/admin/clinics") return adminClinics();
  if (method === "GET" && seg[0] === "admin" && seg[1] === "clinics" && seg[2] && !seg[3]) {
    const r = adminClinics().find((c) => c.id === seg[2]);
    if (!r) throw new MockNotFound(pathname);
    return {
      clinic: { id: r.id, name: r.name, city: r.city, phone_e164: "+918702345678", verification_status: r.verification_status, created_at: r.created_at },
      is_live: r.is_live,
      subscriptions: r.subscription_status ? [{ id: "s-" + r.id, status: r.subscription_status, billing_cycle: r.billing_cycle, trial_ends_at: null, current_period_end: r.current_period_end }] : [],
      payments: r.paid_total_paise > 0
        ? [{ id: "p1", billing_cycle: "yearly", amount_paise: r.paid_total_paise, status: "paid", razorpay_payment_id: "pay_mock_1", razorpay_order_id: "order_mock_1", paid_at: new Date(Date.now() - 20 * 864e5).toISOString(), created_at: new Date(Date.now() - 20 * 864e5).toISOString() }]
        : [],
      staff: [{ role: "owner", status: "active", full_name: "Ravi Kumar", phone: "+919848012345" }, { role: "receptionist", status: "active", full_name: "Geeta", phone: null }],
      usage: { appointments_30d: r.appointments_30d, by_source: { ai_call: r.ai_bookings_30d, staff_manual: r.appointments_30d - r.ai_bookings_30d }, no_show_rate: 8, calls_30d: 61, escalated_30d: 4, open_actions: 3, portal_links_30d: 12 },
      patients: { total: r.patients, new_30d: 9 },
      notes: adminNotes.filter((n) => n.clinic_id === r.id),
      history: applicationHistory.filter((h) => h.target_id === r.id),
      invoices: r.paid_total_paise > 0 ? [{ id: "inv-p1", kind: "invoice", number: "INV/26-27/00001", payment_id: "p1", total_paise: r.paid_total_paise, issued_at: new Date(Date.now() - 20 * 864e5).toISOString() }] : [],
      emails: [
        { id: "em1", kind: "payment.received", to_email: "ravi@srisai.example", status: "sent", attempts: 1, last_error: null, created_at: new Date(Date.now() - 20 * 864e5).toISOString(), sent_at: new Date(Date.now() - 20 * 864e5).toISOString() },
        { id: "em2", kind: "application.approved", to_email: "ravi@srisai.example", status: "sent", attempts: 1, last_error: null, created_at: new Date(Date.now() - 39 * 864e5).toISOString(), sent_at: new Date(Date.now() - 39 * 864e5).toISOString() },
      ],
      // Sri Sai's owner has opened access, so the support flow can be tried.
      support_access: r.id === "a0000000-0000-4000-8000-000000000001"
        ? { id: "g1", reason: "A patient's booking shows twice — please check", created_at: new Date(Date.now() - 3600e3).toISOString(), expires_at: new Date(Date.now() + 3 * 3600e3).toISOString() }
        : null,
    };
  }
  if (method === "GET" && seg[0] === "admin" && seg[1] === "clinics" && seg[3] === "support" && seg[4] === "patients") {
    if (seg[2] !== "a0000000-0000-4000-8000-000000000001") throw new ApiError(403, "FORBIDDEN", "This clinic has not opened access for SAHVA support");
    if (seg[5]) {
      const p = supportPatients.find((x) => x.id === seg[5]);
      if (!p) throw new MockNotFound(pathname);
      return { ...p, appointments: [{ id: "ap1", starts_at: new Date(Date.now() + 864e5).toISOString(), status: "booked", source: "ai_call", token_number: 7, doctors: { full_name: "Dr. Ramesh Babu" } }] };
    }
    const q = (query.get("q") ?? "").toLowerCase();
    return supportPatients.filter((p) => p.full_name.toLowerCase().includes(q) || p.phone_e164.includes(q)).map(({ id, full_name, phone_e164 }) => ({ id, full_name, phone_e164 }));
  }
  if (method === "POST" && seg[0] === "admin" && seg[1] === "clinics" && seg[3] === "subscription") {
    const c = adminClinicRows.find((x) => x.id === seg[2]);
    if (!c) throw new MockNotFound(pathname);
    const base = Math.max(Date.now(), new Date(c.current_period_end ?? Date.now()).getTime());
    c.current_period_end = new Date(base + Number(b.days) * 864e5).toISOString();
    applicationHistory.unshift({ id: crypto.randomUUID(), target_id: c.id, action: `subscription.${b.action}`, reason: String(b.note), created_at: new Date().toISOString(), platform_admins: { full_name: "Ops Admin" } });
    return c;
  }
  if (method === "POST" && seg[0] === "admin" && seg[1] === "clinics" && seg[3] === "notes") {
    const n = { id: crypto.randomUUID(), clinic_id: seg[2], body: String(b.body), created_at: new Date().toISOString(), platform_admins: { full_name: "Ops Admin" } };
    adminNotes.unshift(n);
    return n;
  }

  if (method === "GET" && pathname === "/admin/payments") {
    const st = query.get("status") ?? "all";
    return ledger.filter((p) => st === "all" || p.status === st).map((p) => ({ ...p, invoice_id: p.status === "paid" ? `inv-${p.id}` : null }));
  }
  if (method === "GET" && pathname === "/admin/payments/exceptions") {
    return paymentExceptions.filter((e) => e.status === (query.get("status") ?? "open"));
  }
  if (method === "GET" && pathname === "/admin/payments/events") return paymentEvents;
  if (method === "POST" && pathname === "/admin/payments/reconcile") return { checked: 2, activated: 0, held: 0, authorized: 0, expired: 1, errors: 0 };
  if (method === "POST" && seg[0] === "admin" && seg[1] === "payments" && seg[2] === "exceptions" && seg[4] === "resolve") {
    const ex = paymentExceptions.find((e) => e.id === seg[3]);
    if (!ex || ex.status !== "open") throw new ApiError(409, "INVALID_STATE", "That exception is not open");
    ex.status = b.action === "dismissed" ? "dismissed" : "resolved";
    ex.resolution = String(b.note);
    return ex;
  }
  if (method === "GET" && seg[0] === "admin" && seg[1] === "invoices" && seg[2]) {
    const p = ledger.find((x) => `inv-${x.id}` === seg[2]) ?? (seg[2] === "inv-p1" ? ledger[0] : undefined);
    if (!p) throw new MockNotFound(pathname);
    return mockInvoice(seg[2], "invoice", ledger.indexOf(p) + 1, p.captured_paise ?? p.amount_paise, p.billing_cycle, p.period_start, p.period_end, p.clinics.name, p.clinic_id);
  }
  if (method === "GET" && pathname === "/admin/settings") {
    return { ...platformSettings, invoicing_ready: platformSettings.legal_name.length >= 3, invoices_issued: ledger.filter((p) => p.status === "paid").length };
  }
  if (method === "PUT" && pathname === "/admin/settings") {
    Object.assign(platformSettings, b, { gstin: (b.gstin as string) || null, pan: (b.pan as string) || null });
    return platformSettings;
  }
  if (method === "GET" && pathname === "/admin/security") {
    const days = Number(query.get("days") ?? 7);
    const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
    const events = [
      { id: "se1", kind: "auth_failed", actor_user_id: null, clinic_id: null, ip: "203.0.113.9", method: "GET", path: "/api/clinic/me", details: { status: 401 }, created_at: ago(1), clinics: null },
      { id: "se2", kind: "auth_failed", actor_user_id: null, clinic_id: null, ip: "203.0.113.9", method: "GET", path: "/api/patients", details: { status: 401 }, created_at: ago(1.1), clinics: null },
      { id: "se3", kind: "portal_link_invalid", actor_user_id: null, clinic_id: null, ip: "198.51.100.4", method: "GET", path: "/api/portal/:token", details: { status: 401 }, created_at: ago(5), clinics: null },
      { id: "se4", kind: "role_changed", actor_user_id: "u1", clinic_id: "a0000000-0000-4000-8000-000000000001", ip: null, method: null, path: null, details: { role_before: "receptionist", role_after: "manager" }, created_at: ago(30), clinics: { name: "Sri Sai Clinic" } },
      { id: "se5", kind: "admin_denied", actor_user_id: null, clinic_id: null, ip: "192.0.2.77", method: "GET", path: "/api/admin/overview", details: { status: 401 }, created_at: ago(70), clinics: null },
    ].filter((e) => new Date(e.created_at).getTime() > Date.now() - days * 864e5);
    const by_kind: Record<string, number> = {};
    for (const e of events) by_kind[e.kind] = (by_kind[e.kind] ?? 0) + 1;
    const ips = new Map<string, number>();
    for (const e of events) if (e.ip) ips.set(e.ip, (ips.get(e.ip) ?? 0) + 1);
    return { days, by_kind, top_addresses: [...ips].map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count), events, truncated: false };
  }
  if (method === "GET" && pathname === "/admin/payments/refund-requests") return refundRequests;
  if (method === "POST" && seg[0] === "admin" && seg[1] === "payments" && seg[2] === "refund-requests" && seg[3]) {
    // Mirrors admin_decide_refund_request(): someone else approves; the asker may withdraw.
    const r = refundRequests.find((x) => x.id === seg[3]);
    if (!r) throw new MockNotFound(pathname);
    if (r.status !== "pending") throw new ApiError(409, "INVALID_STATE", `This refund is ${r.status} already`);
    const action = seg[4];
    if ((action === "approve" || action === "decline") && r.requested_by === ME_ADMIN)
      throw new ApiError(403, "FORBIDDEN", "A refund you asked for must be approved by someone else");
    if (action === "cancel" && r.requested_by !== ME_ADMIN) throw new ApiError(403, "FORBIDDEN", "Only the admin who asked can withdraw it");
    r.status = action === "approve" ? "approved" : action === "decline" ? "declined" : "cancelled";
    r.decided_at = new Date().toISOString();
    r.decision_note = (b.note as string) || null;
    r.decider = action === "cancel" ? null : { full_name: "Ops Admin" };
    if (action === "approve") {
      const p = ledger.find((x) => x.id === r.payment_id);
      if (p) p.refunded_paise += r.amount_paise;
    }
    return r;
  }
  if (method === "POST" && seg[0] === "admin" && seg[1] === "payments" && seg[3] === "refund") {
    // Mirrors admin_record_refund(): never more than is left.
    const p = ledger.find((x) => x.id === seg[2]);
    if (!p) throw new MockNotFound(pathname);
    const left = (p.captured_paise ?? p.amount_paise) - p.refunded_paise;
    if (Number(b.amount_paise) > left) throw new ApiError(409, "TOO_MUCH", "That is more than is left to refund.");
    if (Number(b.amount_paise) > platformSettings.refund_second_approval_paise) {
      const req = {
        id: crypto.randomUUID(), clinic_id: p.clinic_id, payment_id: p.id, amount_paise: Number(b.amount_paise), revoke_period: !!b.revoke_period,
        reason: String(b.reason), status: "pending", requested_by: ME_ADMIN, requested_at: new Date().toISOString(), decided_at: null, decision_note: null,
        clinics: { name: p.clinics.name }, subscription_payments: { razorpay_payment_id: p.razorpay_payment_id, billing_cycle: p.billing_cycle, amount_paise: p.amount_paise },
        requester: { full_name: "Ops Admin" }, decider: null,
      };
      refundRequests.unshift(req);
      return { needs_approval: true, request: req };
    }
    p.refunded_paise += Number(b.amount_paise);
    paymentEvents.unshift({ id: crypto.randomUUID(), event_type: "refund.processed", signature_ok: true, razorpay_payment_id: p.razorpay_payment_id, razorpay_order_id: null, amount_paise: Number(b.amount_paise), outcome: "refund processed", received_at: new Date().toISOString() });
    return { id: crypto.randomUUID(), amount_paise: b.amount_paise };
  }

  if (method === "GET" && pathname === "/admin/analytics") {
    // Six (or twelve) months of a small platform growing, as admin_monthly_metrics returns.
    const n = Number(query.get("months") ?? 6);
    const now = new Date();
    const months = Array.from({ length: n }, (_, i) => {
      const k = n - 1 - i;
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
      const g = Math.max(0, n - k);
      return {
        month: d.toISOString().slice(0, 10), new_clinics: Math.max(1, Math.round(g / 2)), approved: Math.round(g / 2), first_payments: Math.max(0, Math.round(g / 3)),
        collected_paise: g * 199900, refunded_paise: k === 0 ? 199900 : 0, mrr_paise: g * 2 * 199900, paying_clinics: g * 2,
        new_patients: g * 21, appointments: g * 120, ai_bookings: g * 63, completed: g * 100, no_shows: g * 7,
      };
    });
    return {
      months,
      clinics: [
        { id: "a0000000-0000-4000-8000-000000000003", name: "Lotus Clinic", city: "Nizamabad", health: { score: 5, band: "at_risk", reasons: ["Not live: trial or plan ended more than 3 days ago", "No bookings in two weeks", "No staff sign-in for 12 days"] } },
        { id: "a0000000-0000-4000-8000-000000000002", name: "Krishna Clinic", city: "Karimnagar", health: { score: 60, band: "watch", reasons: ["Plan ended — patient features stop within 3 days", "No staff sign-in for 8 days"] } },
        { id: "a0000000-0000-4000-8000-000000000001", name: "Sri Sai Clinic", city: "Warangal", health: { score: 100, band: "healthy", reasons: [] } },
      ],
    };
  }

  // ---- billing -------------------------------------------------------------
  // Mirrors routes/billing.ts. A trial with 11 days left; "paying" goes
  // through the same verify endpoint and activate rules as the real API.
  if (method === "GET" && pathname === "/billing") {
    return { ...billing, invoices: billing.payments.map((p, i) => ({ id: `inv-${p.id}`, kind: "invoice", number: `INV/26-27/${String(billing.payments.length - i).padStart(5, "0")}`, payment_id: p.id, total_paise: p.amount_paise, issued_at: p.paid_at })) };
  }
  if (method === "GET" && seg[0] === "billing" && seg[1] === "invoices" && seg[2]) {
    const i = billing.payments.findIndex((p) => `inv-${p.id}` === seg[2]);
    if (i < 0) throw new MockNotFound(pathname);
    const p = billing.payments[i];
    return mockInvoice(seg[2], "invoice", billing.payments.length - i, p.amount_paise, p.billing_cycle, p.period_start, p.period_end, d.clinic.name, d.clinic.id);
  }
  if (method === "POST" && pathname === "/billing/orders") {
    const cycle = b.cycle === "yearly" ? "yearly" : "monthly";
    const amount = cycle === "yearly" ? billing.plan.yearly_price_paise : billing.plan.monthly_price_paise;
    const order_id = `order_mock_${Date.now()}`;
    pendingOrders.set(order_id, { cycle, amount });
    return { order_id, amount, currency: "INR", key_id: "rzp_test_mock", description: `SAHVA for Clinics — ${cycle}`, prefill_email: d.me.email };
  }
  if (method === "POST" && pathname === "/billing/verify") {
    const order = pendingOrders.get(String(b.razorpay_order_id));
    if (!order) throw new MockNotFound(pathname);
    pendingOrders.delete(String(b.razorpay_order_id));
    // Paid time starts when the current period ends (keeps trial days).
    const start = new Date(Math.max(Date.now(), new Date(billing.subscription.current_period_end).getTime()));
    const end = new Date(start);
    if (order.cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    billing = {
      ...billing,
      subscription: { ...billing.subscription, status: "active", billing_cycle: order.cycle, current_period_end: end.toISOString() },
      payments: [
        {
          id: crypto.randomUUID(),
          billing_cycle: order.cycle,
          amount_paise: order.amount,
          period_start: start.toISOString(),
          period_end: end.toISOString(),
          paid_at: new Date().toISOString(),
          razorpay_payment_id: String(b.razorpay_payment_id),
        },
        ...billing.payments,
      ],
    };
    return { status: "paid" };
  }

  // ---- patient portal ----------------------------------------------------
  if (method === "GET" && pathname === "/me") return d.patientMe;
  // ---- patient: your clinic, booking, several clinics ----
  if (method === "GET" && pathname === "/me/clinics") {
    const two = mockFlag("sahva.mock.twoClinics");
    return [
      { clinic_id: d.clinic.id, name: d.clinic.name, city: d.clinic.city, patient_name: d.patientMe.patient.full_name, current: true },
      ...(two ? [{ clinic_id: "c2000000-0000-4000-8000-000000000002", name: "Krishna Clinic", city: "Karimnagar", patient_name: d.patientMe.patient.full_name, current: false }] : []),
    ];
  }
  if (method === "GET" && pathname === "/me/clinic") {
    return {
      clinic: { id: d.clinic.id, name: d.clinic.name, city: d.clinic.city, phone_e164: d.clinic.phone_e164, timezone: "Asia/Kolkata" },
      booking: { enabled: true, horizon_days: 30, min_notice_minutes: 30 },
      doctors: d.doctors.filter((x) => x.is_active).map((x) => ({
        id: x.id, full_name: x.full_name, specialty: x.specialty, qualifications: x.qualifications, languages: x.languages,
        consult_fee_paise: x.consult_fee_paise, followup_fee_paise: x.followup_fee_paise, consult_duration_min: x.consult_duration_min, colour_hex: x.colour_hex,
        sessions: d.doctorSessions.filter((ss) => ss.doctor_id === x.id).map((ss) => ({ day_of_week: ss.day_of_week, starts_at: ss.starts_at.slice(0, 5), ends_at: ss.ends_at.slice(0, 5) })),
      })),
      hours: hours.map((h) => ({ day_of_week: h.day_of_week, opens_at: String(h.opens_at).slice(0, 5), closes_at: String(h.closes_at).slice(0, 5), label: h.label ?? null })),
      closures: [],
      services: d.services.filter((x) => x.is_active).map((x) => ({ id: x.id, name_en: x.name_en, name_te: x.name_te ?? null, description: null, price_paise: x.price_paise ?? null, duration_min: x.duration_min ?? null })),
      faqs: d.faqs.filter((x) => x.is_active).slice(0, 6).map((x) => ({ id: x.id, question_en: x.question_en, question_te: x.question_te ?? null, answer_en: x.answer_en, answer_te: x.answer_te ?? null })),
    };
  }
  if (method === "GET" && pathname === "/me/slots") {
    // Mirrors get_available_slots for the mock: 15-minute slots in the doctor's sessions that day.
    const date = query.get("date") ?? "";
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const out: { slot_start: string; slot_end: string; remaining: number }[] = [];
    for (const ss of d.doctorSessions.filter((x) => x.doctor_id === query.get("doctor_id") && x.day_of_week === dow)) {
      const [h0, m0] = ss.starts_at.split(":").map(Number);
      const [h1, m1] = ss.ends_at.split(":").map(Number);
      for (let t = h0 * 60 + m0; t + 15 <= h1 * 60 + m1; t += 15) {
        const start = new Date(`${date}T${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}:00+05:30`);
        if (start.getTime() < Date.now() + 30 * 60_000) continue;
        out.push({ slot_start: start.toISOString(), slot_end: new Date(start.getTime() + 15 * 60_000).toISOString(), remaining: 1 });
      }
    }
    return out.slice(0, 16);
  }
  if (method === "POST" && pathname === "/me/appointments") {
    if (takeSwitch()) throw new ApiError(409, "SLOT_TAKEN", "That time is no longer available.");
    const doc = d.doctors.find((x) => x.id === b.doctor_id);
    const appt = { ...d.patientMe.upcoming[0], id: crypto.randomUUID(), starts_at: String(b.starts_at), status: "booked", doctor_name: doc?.full_name ?? "", doctor_specialty: doc?.specialty ?? "" };
    (d.patientMe.upcoming as unknown[]).unshift(appt);
    return appt;
  }
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
  // A file upload is not JSON; only parse what is.
  let body: unknown;
  try {
    body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  } catch {
    body = undefined;
  }

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
