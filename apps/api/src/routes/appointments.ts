import { Router } from "express";
import { db } from "../db/client.js";

export const appointments = Router();

type JoinedAppt = {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_id: number;
  doctor_name: string;
  starts_at: string;
  duration_min: number;
  status: string;
  reason: string | null;
};

const SELECT_JOINED = `
  SELECT a.id, a.patient_id, a.doctor_id, a.starts_at, a.duration_min, a.status, a.reason,
         p.name AS patient_name, p.phone AS patient_phone,
         d.name AS doctor_name
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors d ON d.id = a.doctor_id
`;

appointments.get("/", (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const status = req.query.status as string | undefined;

  const where: string[] = [];
  const params: unknown[] = [];
  if (from) {
    where.push("a.starts_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("a.starts_at < ?");
    params.push(to);
  }
  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }
  const sql =
    SELECT_JOINED +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY a.starts_at ASC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

appointments.get("/calendar", (req, res) => {
  const from = (req.query.from as string) || new Date().toISOString().slice(0, 10);
  const to =
    (req.query.to as string) ||
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = db
    .prepare(SELECT_JOINED + " WHERE a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at ASC")
    .all(from, to) as JoinedAppt[];

  // Group by YYYY-MM-DD
  const byDay: Record<string, JoinedAppt[]> = {};
  for (const r of rows) {
    const day = r.starts_at.slice(0, 10);
    (byDay[day] ||= []).push(r);
  }
  res.json(byDay);
});
