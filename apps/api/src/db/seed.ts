import { db } from "./client.js";

/**
 * Idempotent seed. Only runs if the clinics table is empty.
 * Today is computed at boot so the dashboard always shows "current" data.
 */
export function seedIfEmpty(): void {
  const row = db.prepare("SELECT COUNT(*) as n FROM clinics").get() as { n: number };
  if (row.n > 0) return;

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const iso = (d: Date) => d.toISOString();
  const daysFromNow = (n: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    d.setHours(hour, minute, 0, 0);
    return iso(d);
  };

  // --- Clinic ---
  const clinicInsert = db.prepare(
    "INSERT INTO clinics (name, city, phone) VALUES (?, ?, ?)"
  );
  const clinicId = Number(
    clinicInsert.run("Sri Sai Clinic", "Warangal", "+91 870 123 4567").lastInsertRowid
  );

  // --- Doctors ---
  const docInsert = db.prepare(
    "INSERT INTO doctors (clinic_id, name, specialty, languages) VALUES (?, ?, ?, ?)"
  );
  const drAnitha = Number(
    docInsert.run(clinicId, "Dr. Anitha Reddy", "General Physician", "en,te").lastInsertRowid
  );
  const drRamesh = Number(
    docInsert.run(clinicId, "Dr. Ramesh Kumar", "Pediatrician", "en,te").lastInsertRowid
  );
  const drPriya = Number(
    docInsert.run(clinicId, "Dr. Priya Sharma", "ENT Specialist", "en,te").lastInsertRowid
  );

  // --- Patients ---
  const patInsert = db.prepare(
    "INSERT INTO patients (clinic_id, name, phone, preferred_language) VALUES (?, ?, ?, ?)"
  );
  const patients = [
    ["Ravi Kumar", "9876543210", "te"],
    ["Lakshmi Devi", "9876501234", "te"],
    ["Suresh Goud", "9123456780", "te"],
    ["Priya Sharma", "9988776655", "en"],
    ["Mohammed Iqbal", "9012345678", "en"],
  ] as const;
  const patientIds = patients.map(([n, p, l]) =>
    Number(patInsert.run(clinicId, n, p, l).lastInsertRowid)
  );

  // --- Appointments (8 spread across past, today, future) ---
  const apptInsert = db.prepare(
    `INSERT INTO appointments (clinic_id, patient_id, doctor_id, starts_at, duration_min, status, reason)
     VALUES (?, ?, ?, ?, 15, ?, ?)`
  );
  type Appt = [number, number, string, string, string?];
  const seedAppts: Appt[] = [
    // past (completed)
    [patientIds[0], drAnitha, daysFromNow(-7, 10, 0), "completed", "Fever and cough"],
    [patientIds[1], drPriya, daysFromNow(-5, 11, 30), "completed", "Ear pain"],
    [patientIds[2], drRamesh, daysFromNow(-3, 9, 30), "completed", "Child vaccination"],
    // today
    [patientIds[3], drAnitha, daysFromNow(0, 11, 0), "booked", "Routine checkup"],
    [patientIds[4], drPriya, daysFromNow(0, 15, 30), "booked", "Sinus follow-up"],
    // future
    [patientIds[0], drRamesh, daysFromNow(2, 10, 0), "booked", "Son's annual checkup"],
    [patientIds[1], drAnitha, daysFromNow(4, 16, 0), "booked", "Diabetes follow-up"],
    [patientIds[3], drPriya, daysFromNow(6, 12, 30), "booked", "Hearing test"],
  ];
  for (const a of seedAppts) apptInsert.run(clinicId, ...a);

  // --- Past calls (4) ---
  const callInsert = db.prepare(
    `INSERT INTO calls (clinic_id, patient_id, started_at, ended_at, outcome, language, transcript, summary, was_missed_before_ai)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const fakeTranscript = (lang: "en" | "te", outcome: string) =>
    JSON.stringify([
      { role: "assistant", content: lang === "te" ? "నమస్తే, శ్రీ సాయి క్లినిక్." : "Hello, Sri Sai Clinic.", ts: "T+0s" },
      { role: "user", content: lang === "te" ? "నాకు అపాయింట్‌మెంట్ కావాలి" : "I'd like to book an appointment", ts: "T+2s" },
      { role: "assistant", content: "Sure, may I have your name and phone number?", ts: "T+4s" },
      { role: "user", content: "Ravi Kumar, 9876543210", ts: "T+6s" },
      { role: "assistant", content: `Outcome: ${outcome}`, ts: "T+60s" },
    ]);

  callInsert.run(
    clinicId,
    patientIds[0],
    daysFromNow(-2, 10, 5),
    daysFromNow(-2, 10, 8),
    "booked",
    "en",
    fakeTranscript("en", "booked"),
    "Booked Dr. Anitha Reddy for general consultation",
    0
  );
  callInsert.run(
    clinicId,
    patientIds[1],
    daysFromNow(-2, 14, 20),
    daysFromNow(-2, 14, 24),
    "rescheduled",
    "te",
    fakeTranscript("te", "rescheduled"),
    "Rescheduled ENT appointment from Friday to Monday",
    0
  );
  callInsert.run(
    clinicId,
    patientIds[2],
    daysFromNow(-1, 9, 0),
    daysFromNow(-1, 9, 3),
    "cancelled",
    "te",
    fakeTranscript("te", "cancelled"),
    "Cancelled pediatric vaccination appointment",
    0
  );
  callInsert.run(
    clinicId,
    patientIds[3],
    daysFromNow(-1, 18, 45),
    daysFromNow(-1, 18, 49),
    "booked",
    "en",
    fakeTranscript("en", "booked"),
    "Recovered missed call — booked hearing test",
    1 // this one was missed before AI picked up
  );

  console.log(`[seed] populated clinic ${clinicId} (${todayIso})`);
}
