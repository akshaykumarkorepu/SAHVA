import { db } from "../db/client.js";
import { daySlots, isWithinClinicHours } from "../lib/time.js";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function getClinicId(): number {
  const row = db.prepare("SELECT id FROM clinics ORDER BY id ASC LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error("No clinic configured");
  return row.id;
}

function findDoctor(input: string): { id: number; name: string } | null {
  const idNum = Number(input);
  if (Number.isFinite(idNum) && idNum > 0) {
    const row = db.prepare("SELECT id, name FROM doctors WHERE id = ?").get(idNum) as
      | { id: number; name: string }
      | undefined;
    if (row) return row;
  }
  // case-insensitive contains match on the name (strip optional "Dr." prefix)
  const cleaned = input.replace(/^dr\.?\s*/i, "").trim();
  const rows = db
    .prepare("SELECT id, name FROM doctors")
    .all() as { id: number; name: string }[];
  const direct = rows.find(
    (r) => r.name.toLowerCase() === input.toLowerCase() || r.name.toLowerCase() === `dr. ${cleaned.toLowerCase()}`
  );
  if (direct) return direct;
  const partial = rows.find(
    (r) => r.name.toLowerCase().includes(cleaned.toLowerCase()) && cleaned.length > 0
  );
  return partial || null;
}

function upsertPatient(clinicId: number, name: string, phone: string): { id: number; name: string } {
  const cleanPhone = phone.replace(/\D/g, "").slice(-10);
  const existing = db
    .prepare("SELECT id, name FROM patients WHERE phone = ?")
    .get(cleanPhone) as { id: number; name: string } | undefined;
  if (existing) {
    if (existing.name !== name) {
      db.prepare("UPDATE patients SET name = ? WHERE id = ?").run(name, existing.id);
    }
    return { id: existing.id, name };
  }
  const result = db
    .prepare(
      "INSERT INTO patients (clinic_id, name, phone, preferred_language) VALUES (?, ?, ?, NULL)"
    )
    .run(clinicId, name, cleanPhone);
  return { id: Number(result.lastInsertRowid), name };
}

export function checkAvailability(input: {
  doctor: string;
  date: string;
}): Result<{ doctor: { id: number; name: string } | null; date: string; slots: { startsAt: string; label: string }[] }> {
  const doctor = findDoctor(input.doctor);
  if (!doctor) return { ok: false, error: `No doctor found matching "${input.doctor}".` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { ok: false, error: "Date must be YYYY-MM-DD." };
  const taken = (
    db
      .prepare(
        "SELECT starts_at FROM appointments WHERE doctor_id = ? AND date(starts_at) = ? AND status = 'booked'"
      )
      .all(doctor.id, input.date) as { starts_at: string }[]
  ).map((r) => r.starts_at);
  const slots = daySlots(input.date, taken);
  return { ok: true, data: { doctor, date: input.date, slots } };
}

export function bookAppointment(input: {
  patient_name: string;
  phone: string;
  doctor: string;
  starts_at: string;
  reason?: string;
}): Result<{
  appointment_id: number;
  patient: { id: number; name: string; phone: string };
  doctor: { id: number; name: string };
  starts_at: string;
}> {
  const doctor = findDoctor(input.doctor);
  if (!doctor) return { ok: false, error: `No doctor found matching "${input.doctor}".` };
  if (!isWithinClinicHours(input.starts_at))
    return { ok: false, error: "That time is outside clinic hours (09:00–17:00, lunch 13:00–14:00)." };

  const clinicId = getClinicId();
  const patient = upsertPatient(clinicId, input.patient_name.trim(), input.phone);

  // conflict check
  const conflict = db
    .prepare(
      "SELECT id FROM appointments WHERE doctor_id = ? AND starts_at = ? AND status = 'booked'"
    )
    .get(doctor.id, input.starts_at) as { id: number } | undefined;
  if (conflict) return { ok: false, error: "That slot was just taken. Please pick another time." };

  const res = db
    .prepare(
      `INSERT INTO appointments (clinic_id, patient_id, doctor_id, starts_at, status, reason)
       VALUES (?, ?, ?, ?, 'booked', ?)`
    )
    .run(clinicId, patient.id, doctor.id, input.starts_at, input.reason || null);
  return {
    ok: true,
    data: {
      appointment_id: Number(res.lastInsertRowid),
      patient: { id: patient.id, name: patient.name, phone: input.phone.replace(/\D/g, "").slice(-10) },
      doctor,
      starts_at: input.starts_at,
    },
  };
}

export function rescheduleAppointment(input: {
  phone: string;
  new_starts_at: string;
  doctor?: string;
}): Result<{ appointment_id: number; new_starts_at: string; doctor: { id: number; name: string } }> {
  const phone = input.phone.replace(/\D/g, "").slice(-10);
  const patient = db.prepare("SELECT id FROM patients WHERE phone = ?").get(phone) as
    | { id: number }
    | undefined;
  if (!patient) return { ok: false, error: "No patient on file with that phone number." };
  if (!isWithinClinicHours(input.new_starts_at))
    return { ok: false, error: "That time is outside clinic hours." };

  const next = db
    .prepare(
      "SELECT id, doctor_id, starts_at FROM appointments WHERE patient_id = ? AND status = 'booked' AND starts_at >= datetime('now') ORDER BY starts_at ASC LIMIT 1"
    )
    .get(patient.id) as { id: number; doctor_id: number; starts_at: string } | undefined;
  if (!next) return { ok: false, error: "No upcoming appointment found to reschedule." };

  let doctorId = next.doctor_id;
  let doctorRow: { id: number; name: string } | null = null;
  if (input.doctor) {
    const d = findDoctor(input.doctor);
    if (!d) return { ok: false, error: `No doctor found matching "${input.doctor}".` };
    doctorId = d.id;
    doctorRow = d;
  } else {
    doctorRow =
      (db.prepare("SELECT id, name FROM doctors WHERE id = ?").get(doctorId) as
        | { id: number; name: string }
        | undefined) ?? null;
  }
  if (!doctorRow) return { ok: false, error: "Doctor lookup failed." };

  const conflict = db
    .prepare(
      "SELECT id FROM appointments WHERE doctor_id = ? AND starts_at = ? AND status = 'booked' AND id != ?"
    )
    .get(doctorId, input.new_starts_at, next.id) as { id: number } | undefined;
  if (conflict) return { ok: false, error: "That slot is taken. Please pick another time." };

  db.prepare(
    "UPDATE appointments SET doctor_id = ?, starts_at = ?, status = 'booked', updated_at = datetime('now') WHERE id = ?"
  ).run(doctorId, input.new_starts_at, next.id);

  return { ok: true, data: { appointment_id: next.id, new_starts_at: input.new_starts_at, doctor: doctorRow } };
}

export function cancelAppointment(input: { phone: string }): Result<{ appointment_id: number; starts_at: string }> {
  const phone = input.phone.replace(/\D/g, "").slice(-10);
  const patient = db.prepare("SELECT id FROM patients WHERE phone = ?").get(phone) as
    | { id: number }
    | undefined;
  if (!patient) return { ok: false, error: "No patient on file with that phone number." };
  const next = db
    .prepare(
      "SELECT id, starts_at FROM appointments WHERE patient_id = ? AND status = 'booked' AND starts_at >= datetime('now') ORDER BY starts_at ASC LIMIT 1"
    )
    .get(patient.id) as { id: number; starts_at: string } | undefined;
  if (!next) return { ok: false, error: "No upcoming appointment to cancel." };
  db.prepare(
    "UPDATE appointments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).run(next.id);
  return { ok: true, data: { appointment_id: next.id, starts_at: next.starts_at } };
}
