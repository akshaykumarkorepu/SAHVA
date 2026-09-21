import { db } from "../db/client.js";

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

export function buildWhatsAppPreview(appointmentId: number): WhatsAppPreview | null {
  const row = db
    .prepare(
      `SELECT a.id, a.starts_at, a.status,
              p.name AS patient_name, p.phone AS patient_phone,
              d.name AS doctor_name, c.name AS clinic_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN doctors d ON d.id = a.doctor_id
       JOIN clinics c ON c.id = a.clinic_id
       WHERE a.id = ?`
    )
    .get(appointmentId) as
    | {
        id: number;
        starts_at: string;
        status: string;
        patient_name: string;
        patient_phone: string;
        doctor_name: string;
        clinic_name: string;
      }
    | undefined;
  if (!row) return null;

  const startsAt = new Date(row.starts_at);
  const formatted = startsAt.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  const message = `*${row.clinic_name}* ✓

Your appointment is confirmed.

👤 ${row.patient_name}
🩺 ${row.doctor_name}
📅 ${formatted}

Please arrive 10 minutes early. To reschedule, call the clinic or reply to this message.`;

  return {
    appointment_id: row.id,
    to: row.patient_phone,
    patient_name: row.patient_name,
    doctor_name: row.doctor_name,
    starts_at: row.starts_at,
    message,
    sent_at: new Date().toISOString(),
    status: "delivered",
  };
}
